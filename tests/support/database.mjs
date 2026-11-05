import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
export async function database({beforeMigration}={}){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean default false,created_at timestamptz default clock_timestamp());
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
 create table auth.refresh_tokens(id bigserial primary key,user_id text,session_id uuid references auth.sessions(id) on delete cascade);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;`);
 const base=new URL('../../supabase/',import.meta.url);
 // PGlite runs the real cleanup SQL but has no background-worker extensions.
 // The pg_cron installation/schedule is verified against hosted PostgreSQL.
 const migrations=(await readdir(new URL('migrations/',base))).sort().filter(p=>!p.endsWith('_notifications_read_cron.sql'));
 for(const path of ['01_schema.sql','02_seed.sql','04_estatisticas_publicas.sql','05_eventos_contas.sql',...migrations.map(p=>'migrations/'+p)]){if(beforeMigration)await beforeMigration(path,db);await db.exec(await readFile(new URL(path,base),'utf8'));}
 const uid={command:'a1000000-0000-4000-8000-000000000001',a:'a1000000-0000-4000-8000-000000000002',b:'a1000000-0000-4000-8000-000000000003',limited:'a1000000-0000-4000-8000-000000000004'};
 for(const [name,id] of Object.entries(uid)){
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,name+'@example.invalid',{full_name:'Test '+name}]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);
  await db.query("update public.profiles set approved=true,role=$2 where id=$1",[id,name==='command'?'command':'member']);
  if(name==='a'||name==='b')await db.query("insert into public.tab_permissions(user_id,tab) select $1,unnest(array['eventos','anuncios','registos']::public.ushe_tab[])",[id]);
 }
 const as=async(name)=>{await db.exec('reset role');const id=uid[name]||'';await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,session_id:id,exp:Math.floor(Date.now()/1000)+3600,role:name==='anon'?'anon':'authenticated'})]);if(name!=='postgres')await db.exec('set role '+(name==='anon'?'anon':'authenticated'));};
 const rpc=async(name,args={})=>{const entries=Object.entries(args);const result=await db.query('select public.'+name+'('+entries.map(([key],i)=>key+'=> $'+(i+1)).join(',')+') as value',entries.map(([,v])=>v));return result.rows[0].value;};
 return {db,as,uid,rpc};
}
