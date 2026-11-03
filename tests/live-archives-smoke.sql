-- Administrative smoke test: no emails; synthetic data is fully rolled back.
begin;
select set_config('qa.a',gen_random_uuid()::text,true);
select set_config('qa.b',gen_random_uuid()::text,true);
select set_config('qa.event',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) select current_setting('qa.'||v)::uuid,'feed-qa-'||current_setting('qa.'||v)||'@example.invalid',jsonb_build_object('full_name','Feed QA '||v) from unnest(array['a','b'])v;
update public.profiles set approved=true,role=case when id=current_setting('qa.a')::uuid then 'command'::public.ushe_role else 'member'::public.ushe_role end where id in(current_setting('qa.a')::uuid,current_setting('qa.b')::uuid);
insert into public.tab_permissions(user_id,tab) select current_setting('qa.b')::uuid,unnest(array['eventos','anuncios','registos']::public.ushe_tab[]);
insert into auth.sessions(id,user_id,created_at,updated_at) select current_setting('qa.'||v)::uuid,current_setting('qa.'||v)::uuid,now(),now() from unnest(array['a','b'])v;
select public.otp_service('grant',jsonb_build_object('user_id',current_setting('qa.a'),'session_id',current_setting('qa.a')));
select public.otp_service('grant',jsonb_build_object('user_id',current_setting('qa.b'),'session_id',current_setting('qa.b')));
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.a'),'session_id',current_setting('qa.a'),'exp',extract(epoch from now()+interval '1 hour'),'role','authenticated')::text,true);
-- Admin supplies an explicit fixture identifier, then real client role reads and updates it.
insert into public.events(id,title,description,starts_at,ends_at,location,created_by) values(current_setting('qa.event')::uuid,'Feed QA evento','Descrição de teste',now()+interval '1 day',now()+interval '2 days','QA',current_setting('qa.a')::uuid);
set constraints all immediate;
set constraints all deferred;
set local role authenticated;
do $$declare n uuid;p jsonb;known jsonb;begin
 p=public.portal_feed('event',p_target=>current_setting('qa.event')::uuid);
 if jsonb_array_length(p->'items')<>1 then raise exception 'Feed failed';end if;
 known=jsonb_build_object(current_setting('qa.event'),p->'items'->0->>'version');
 if jsonb_array_length(public.portal_feed('event',p_target=>current_setting('qa.event')::uuid,p_known=>known)->'items')<>0 then raise exception 'Unchanged row transmitted';end if;
 select id into n from public.notifications where target_id=current_setting('qa.event')::uuid and type='event';
 if n is null then raise exception 'Real event did not generate notification';end if;
 perform set_config('qa.notification',n::text,true);
 perform public.mark_notifications_read(array[n]);
 if not exists(select 1 from public.notifications where id=n and read_at is not null) then raise exception 'Read state not persisted';end if;
 if not (public.notification_destination(n)->>'available')::boolean then raise exception 'Authorized destination denied';end if;
 begin insert into public.notifications(recipient_id,title,message,type,target_kind,target_id,dedupe_key) values(current_setting('qa.b')::uuid,'Injected','','event','event',current_setting('qa.event')::uuid,'qa-injected');raise exception 'Arbitrary notification allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.b'),'session_id',current_setting('qa.b'),'exp',extract(epoch from now()+interval '1 hour'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.notifications where id=current_setting('qa.notification')::uuid) then raise exception 'Notification IDOR';end if;
 update public.notifications set read_at=now() where id=current_setting('qa.notification')::uuid;
 if found then raise exception 'Notification update IDOR';end if;
end$$;
reset role;
-- Revoking only the synthetic account's tab must make the destination unavailable.
delete from public.tab_permissions where user_id=current_setting('qa.b')::uuid and tab='eventos';
set constraints all immediate;
set local role authenticated;
do $$declare n uuid;begin
 select id into n from public.notifications where target_id=current_setting('qa.event')::uuid and type='event';
 if n is null then raise exception 'Missing own notification';end if;
 if (public.notification_destination(n)->>'available')::boolean then raise exception 'Revoked destination available';end if;
 if public.feed_responses('event',array[current_setting('qa.event')::uuid])<>'{}'::jsonb then raise exception 'Batch responses bypassed RLS';end if;
end$$;
reset role;
select 'PASS: page RPC, delta, real trigger, persisted read state, notification ownership, client insert denial and revoked destination. Rolled back.' as result;
rollback;
