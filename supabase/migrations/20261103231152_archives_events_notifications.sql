begin;
-- Search is evaluated before pagination and under the caller's RLS.
alter table public.events add column feed_search tsvector generated always as (to_tsvector('portuguese'::regconfig,coalesce(title,'')||' '||coalesce(description,'')||' '||coalesce(location,''))) stored;
create index events_feed_search_idx on public.events using gin(feed_search);
alter table public.announcements add column feed_search tsvector generated always as (to_tsvector('portuguese'::regconfig,coalesce(title,'')||' '||coalesce(body,'')||' '||coalesce(author_name,''))) stored;
create index announcements_feed_search_idx on public.announcements using gin(feed_search);
alter table public.event_logs add column feed_search tsvector generated always as (to_tsvector('portuguese'::regconfig,coalesce(event_type,'')||' '||coalesce(location,'')||' '||coalesce(summary,'')||' '||coalesce(observations,''))) stored;
create index event_logs_feed_search_idx on public.event_logs using gin(feed_search);
create index announcements_feed_order_idx on public.announcements(created_at desc,id desc);
create index announcements_feed_kind_idx on public.announcements(kind,created_at desc,id desc);
create index logs_feed_order_idx on public.event_logs(starts_at desc,id desc);
create index logs_feed_kind_idx on public.event_logs(event_type,starts_at desc,id desc);
create index events_feed_order_idx on public.events(starts_at,id);
create index events_feed_ends_idx on public.events(ends_at);

create function private.feed_vote_names(p_kind text,p_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(x.target_id,x.votes),'{}') from (
 select r.event_id target_id,jsonb_agg(jsonb_build_object('user_id',r.user_id,'full_name',p.full_name,'attending',r.attending,'updated_at',r.updated_at) order by r.updated_at,r.user_id) votes
 from public.event_responses r join public.profiles p on p.id=r.user_id
 where p_kind='event' and private.has_tab('eventos') and r.event_id=any(p_ids) group by r.event_id
 union all
 select r.announcement_id,jsonb_agg(jsonb_build_object('user_id',r.user_id,'full_name',p.full_name,'attending',r.attending,'updated_at',r.updated_at) order by r.updated_at,r.user_id)
 from public.announcement_responses r join public.profiles p on p.id=r.user_id join public.announcements a on a.id=r.announcement_id
 where p_kind='announcement' and private.has_tab('anuncios') and a.published and a.allow_responses and r.announcement_id=any(p_ids) group by r.announcement_id
 )x;
$$;
create function public.feed_responses(p_kind text,p_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare allowed uuid[];
begin
 if coalesce(cardinality(p_ids),0)>50 then raise exception 'Página demasiado grande.';end if;
 if p_kind='event' then select array_agg(id) into allowed from public.events where id=any(p_ids);
 elsif p_kind='announcement' then select array_agg(id) into allowed from public.announcements where id=any(p_ids) and published and allow_responses;
 else return '{}'::jsonb;end if;
 return private.feed_vote_names(p_kind,allowed);
end $$;
revoke all on function private.feed_vote_names(text,uuid[]),public.feed_responses(text,uuid[]) from public,anon,authenticated;
grant execute on function private.feed_vote_names(text,uuid[]),public.feed_responses(text,uuid[]) to authenticated;

create function public.portal_feed(p_kind text,p_query text default '',p_filter text default '',p_sort text default '',p_cursor jsonb default null,p_snapshot timestamptz default null,p_from date default null,p_to date default null,p_target uuid default null,p_known jsonb default '{}',p_limit integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare batch jsonb; ids uuid[]; votes jsonb; docs jsonb; total bigint; filters jsonb; snap timestamptz=coalesce(p_snapshot,statement_timestamp()); asc_order boolean; cursor_at timestamptz; cursor_id uuid; page_size integer=least(greatest(coalesce(p_limit,20),1),50);more boolean;next_cursor jsonb;
begin
 if p_kind not in ('event','announcement','log') or length(coalesce(p_query,''))>200 or length(coalesce(p_filter,''))>100 or jsonb_typeof(p_known)<>'object' then raise exception 'Consulta inválida.';end if;
 if p_sort not in ('','asc','desc') then raise exception 'Ordenação inválida.';end if;
 if p_from is not null and not isfinite(p_from) or p_to is not null and not isfinite(p_to) then raise exception 'Data inválida.';end if;
 if p_kind='event' and p_filter not in ('','next','past') then raise exception 'Período inválido.';end if;
 asc_order=case when p_sort<>'' then p_sort='asc' else p_kind='event' and p_filter<>'past' end;
 cursor_at=(p_cursor->>'at')::timestamptz;cursor_id=(p_cursor->>'id')::uuid;
 if (cursor_at is null)<>(cursor_id is null) then raise exception 'Cursor inválido.';end if;
 with authorized as (
 select e.id,e.starts_at sort_at,e.created_at,to_jsonb(e)-'feed_search' doc,e.feed_search,''::text kind,e.ends_at
 from public.events e where p_kind='event'
 union all
 select a.id,a.created_at,a.created_at,to_jsonb(a)-'feed_search',a.feed_search,a.kind,null::timestamptz from public.announcements a where p_kind='announcement'
 union all
 select l.id,l.starts_at,l.created_at,to_jsonb(l)-'feed_search',l.feed_search,l.event_type,null::timestamptz from public.event_logs l where p_kind='log'
 ), filtered as (
 select * from authorized a where (p_target is null or a.id=p_target) and a.created_at<=snap
 and (coalesce(btrim(p_query),'')='' or a.feed_search@@websearch_to_tsquery('portuguese'::regconfig,p_query))
 and (p_target is not null or p_kind='event' and (case when p_filter='past' then a.ends_at<statement_timestamp() else a.ends_at>=statement_timestamp() end) or p_kind<>'event' and (coalesce(p_filter,'')='' or a.kind=p_filter))
 and (p_from is null or a.sort_at>=(p_from::timestamp at time zone 'Europe/Lisbon'))
 and (p_to is null or a.sort_at<((p_to+1)::timestamp at time zone 'Europe/Lisbon'))
 ), windowed as (
 select * from filtered a where cursor_at is null or (asc_order and (a.sort_at,a.id)>(cursor_at,cursor_id)) or (not asc_order and (a.sort_at,a.id)<(cursor_at,cursor_id))
 order by case when asc_order then sort_at end asc,case when not asc_order then sort_at end desc,case when asc_order then id end asc,case when not asc_order then id end desc limit page_size+1
 ) select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'at',w.sort_at,'doc',w.doc) order by case when asc_order then w.sort_at end asc,case when not asc_order then w.sort_at end desc,case when asc_order then w.id end asc,case when not asc_order then w.id end desc),'[]'),(select count(*) from filtered),(select coalesce(jsonb_agg(distinct kind order by kind),'[]') from authorized where kind<>'') into batch,total,filters from windowed w;
 more=jsonb_array_length(batch)>page_size;
 batch=(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(batch) with ordinality x where x.ordinality<=page_size);
 select array_agg((value->>'id')::uuid order by ordinality) into ids from jsonb_array_elements(batch) with ordinality;
 votes=case when p_kind='log' then '{}'::jsonb else public.feed_responses(p_kind,ids) end;
 -- Only the current page's participants and votes are materialized.
 select coalesce(jsonb_agg(jsonb_build_object('record',x.doc,'responses',x.responses,'version',md5((x.doc||jsonb_build_object('responses',x.responses))::text)) order by x.n),'[]') into docs from (
 select b.ordinality n,
 case when p_kind='log' then b.value->'doc'||jsonb_build_object('event_log_participants',coalesce((select jsonb_agg(jsonb_build_object('member_id',ep.member_id,'name',m.name,'uniform_number',m.uniform_number) order by m.uniform_number,m.id) from public.event_log_participants ep join public.member_options() m on m.id=ep.member_id where ep.log_id=(b.value->>'id')::uuid),'[]')) else b.value->'doc' end doc,
 coalesce(votes->(b.value->>'id'),'[]') responses
 from jsonb_array_elements(batch) with ordinality b
 )x;
 next_cursor=case when jsonb_array_length(batch)>0 then (batch->(jsonb_array_length(batch)-1))-'doc' else null end;
 return jsonb_build_object('items',coalesce((select jsonb_agg(value) from jsonb_array_elements(docs) where p_known->>(value->'record'->>'id') is distinct from value->>'version'),'[]'),'ids',coalesce(to_jsonb(ids),'[]'),'next_cursor',next_cursor,'has_more',more,'total',total,'filters',filters,'snapshot',snap);
end $$;
revoke all on function public.portal_feed(text,text,text,text,jsonb,timestamptz,date,date,uuid,jsonb,integer) from public,anon;
grant execute on function public.portal_feed(text,text,text,text,jsonb,timestamptz,date,date,uuid,jsonb,integer) to authenticated;

-- Notifications contain generic text, never copies of restricted event/document bodies.
create table public.notifications(
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(length(title) between 1 and 180),message text not null check(length(message)<=1000),
 type text not null check(type in ('event','announcement','access')),target_kind text not null check(target_kind in ('event','announcement','access')),target_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 dedupe_key text not null check(length(dedupe_key)<=240),unique(recipient_id,dedupe_key)
);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy own_notifications_read on public.notifications for select to authenticated using(recipient_id=(select auth.uid()) and (select private.otp_session_verified()));
create policy own_notifications_update on public.notifications for update to authenticated using(recipient_id=(select auth.uid()) and (select private.otp_session_verified())) with check(recipient_id=(select auth.uid()) and (select private.otp_session_verified()));
create index notifications_recipient_order_idx on public.notifications(recipient_id,created_at desc,id desc);
create index notifications_unread_idx on public.notifications(recipient_id) where read_at is null;
create function private.stamp_notification_read() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.read_at=case when new.read_at is not null then coalesce(old.read_at,clock_timestamp()) else old.read_at end;return new;end$$;
revoke all on function private.stamp_notification_read() from public,anon,authenticated;
create trigger notification_read_clock before update on public.notifications for each row execute function private.stamp_notification_read();

create function public.inbox_page(p_cursor jsonb default null,p_limit integer default 20) returns jsonb
language sql stable security invoker set search_path='' as $$
 with page as(select id,title,message,type,target_kind,target_id,created_at,read_at from public.notifications n
 where p_cursor is null or (n.created_at,n.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid)
 order by n.created_at desc,n.id desc limit least(greatest(coalesce(p_limit,20),1),50)+1),
 shown as(select * from page order by created_at desc,id desc limit least(greatest(coalesce(p_limit,20),1),50))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id desc) from shown s),'[]'),
 'unread',(select count(*) from public.notifications where read_at is null),'has_more',(select count(*) from page)>least(greatest(coalesce(p_limit,20),1),50),
 'next_cursor',(select jsonb_build_object('at',created_at,'id',id) from shown order by created_at,id limit 1),'snapshot',statement_timestamp());
$$;
create function public.mark_notifications_read(p_ids uuid[] default null,p_before timestamptz default null) returns void
language sql security invoker set search_path='' as $$
 update public.notifications set read_at=clock_timestamp() where read_at is null and (p_ids is null or id=any(p_ids)) and created_at<=coalesce(p_before,statement_timestamp());
$$;
create function public.notification_destination(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare n public.notifications;
begin
 select * into n from public.notifications where id=p_id;
 if not found then return jsonb_build_object('available',false);end if;
 if n.target_kind='event' and exists(select 1 from public.events where id=n.target_id) then return jsonb_build_object('available',true,'route','eventos','id',n.target_id);
 elsif n.target_kind='announcement' and exists(select 1 from public.announcements where id=n.target_id) then return jsonb_build_object('available',true,'route','anuncios','id',n.target_id);
 elsif n.target_kind='access' then return jsonb_build_object('available',true,'route','conta');end if;
 return jsonb_build_object('available',false);
end$$;
revoke all on function public.inbox_page(jsonb,integer),public.mark_notifications_read(uuid[],timestamptz),public.notification_destination(uuid) from public,anon;
grant execute on function public.inbox_page(jsonb,integer),public.mark_notifications_read(uuid[],timestamptz),public.notification_destination(uuid) to authenticated;

-- Monotonic, server-stamped revision: identical writes do not create duplicate notices.
alter table public.events add column notice_revision bigint not null default 1;
alter table public.announcements add column notice_revision bigint not null default 1;
create function private.stamp_notice_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then new.notice_revision=1;
 elsif (to_jsonb(new)-'notice_revision'-'feed_search') is distinct from (to_jsonb(old)-'notice_revision'-'feed_search') then new.notice_revision=old.notice_revision+1;
 else new.notice_revision=old.notice_revision;end if;return new;
end$$;
revoke all on function private.stamp_notice_revision() from public,anon,authenticated;
create trigger stamp_event_revision before insert or update on public.events for each row execute function private.stamp_notice_revision();
create trigger stamp_announcement_revision before insert or update on public.announcements for each row execute function private.stamp_notice_revision();
create function private.notify_portal_content() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;title_text text;target uuid;rev bigint;tab_name public.ushe_tab;
begin
 k=case when TG_TABLE_NAME='events' then 'event' else 'announcement' end;
 tab_name=case when k='event' then 'eventos'::public.ushe_tab else 'anuncios'::public.ushe_tab end;
 if TG_OP='UPDATE' and new.notice_revision=old.notice_revision then return new;end if;
 if TG_OP<>'DELETE' and k='announcement' and not coalesce((to_jsonb(new)->>'published')::boolean,false) then return new;end if;
 if TG_OP='DELETE' and k='announcement' and not coalesce((to_jsonb(old)->>'published')::boolean,false) then return old;end if;
 if TG_OP='DELETE' then target=old.id;rev=old.notice_revision+1;title_text=case when k='event' then 'Evento removido' else 'Anúncio removido' end;
 else target=new.id;rev=new.notice_revision;title_text=case when k='event' then 'Agenda atualizada' else 'Comunicação do Comando' end;end if;
 insert into public.notifications(recipient_id,title,message,type,target_kind,target_id,dedupe_key)
 select p.id,title_text,'Existe uma atualização na tua área reservada. Abre para consultar a disponibilidade e as permissões atuais.',k,k,target,k||':'||target::text||':'||rev::text
 from public.profiles p where p.approved and (p.role='command' or exists(select 1 from public.tab_permissions t where t.user_id=p.id and t.tab=tab_name))
 on conflict(recipient_id,dedupe_key) do nothing;
 return case when TG_OP='DELETE' then old else new end;
end$$;
revoke all on function private.notify_portal_content() from public,anon,authenticated;
create trigger notify_event after insert or update or delete on public.events for each row execute function private.notify_portal_content();
create trigger notify_announcement after insert or update or delete on public.announcements for each row execute function private.notify_portal_content();

-- Deferred decision notification sees the final role/approval/tabs of the transaction.
create table private.notification_access_state(user_id uuid primary key references public.profiles(id) on delete cascade,fingerprint text not null,revision bigint not null default 1);
insert into private.notification_access_state(user_id,fingerprint)
select p.id,md5(jsonb_build_object('role',p.role,'approved',p.approved,'tabs',coalesce((select jsonb_agg(jsonb_build_object('tab',t.tab,'can_create',t.can_create) order by t.tab) from public.tab_permissions t where t.user_id=p.id),'[]'))::text) from public.profiles p;
alter table private.notification_access_state enable row level security;
revoke all on private.notification_access_state from public,anon,authenticated,service_role;
create function private.notify_access_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;f text;v bigint;
begin
 if TG_TABLE_NAME='profiles' then u=new.id;else u=case when TG_OP='DELETE' then old.user_id else new.user_id end;end if;
 select md5(jsonb_build_object('role',p.role,'approved',p.approved,'tabs',coalesce((select jsonb_agg(jsonb_build_object('tab',t.tab,'can_create',t.can_create) order by t.tab) from public.tab_permissions t where t.user_id=p.id),'[]'))::text) into f from public.profiles p where p.id=u;
 if f is null then return null;end if;
 insert into private.notification_access_state(user_id,fingerprint) values(u,f) on conflict(user_id) do update set fingerprint=excluded.fingerprint,revision=private.notification_access_state.revision+1 where private.notification_access_state.fingerprint is distinct from excluded.fingerprint returning revision into v;
 if v is not null then insert into public.notifications(recipient_id,title,message,type,target_kind,target_id,dedupe_key) values(u,'Acesso à unidade atualizado','O Comando atualizou as permissões da tua conta. Consulta o estado atual na área da conta.','access','access',u,'access:'||u::text||':'||v::text) on conflict do nothing;end if;
 return null;
end$$;
revoke all on function private.notify_access_decision() from public,anon,authenticated;
create constraint trigger notify_profile_access after update on public.profiles deferrable initially deferred for each row when (old.role is distinct from new.role or old.approved is distinct from new.approved) execute function private.notify_access_decision();
create constraint trigger notify_tab_access after insert or update or delete on public.tab_permissions deferrable initially deferred for each row execute function private.notify_access_decision();
notify pgrst,'reload schema';
commit;
