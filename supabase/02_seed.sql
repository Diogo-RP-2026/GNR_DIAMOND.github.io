-- Conteúdo inicial fornecido para o servidor de roleplay Diamond.
-- Executar depois de 01_schema.sql. Repetir não substitui alterações do Comando.
begin;
insert into public.contact_info(id,hero_title,hero_intro,recruitment,contact_text,discord_url,motto) values
(1,'Unidade de Segurança e Honras do Estado',
'Ao serviço da cidade Diamond. Protegemos as instituições, asseguramos a ordem e honramos o Estado com disciplina e sentido de missão.',
'Queres servir na USHE? Contacta o Comando no Discord da cidade Diamond para conhecer os requisitos e o próximo período de recrutamento.',
'Para assuntos institucionais, candidaturas ou esclarecimentos, procura o Comando da USHE nos canais oficiais da cidade Diamond. O convite para o Discord será disponibilizado pelo Comando.',
'','Honra, Disciplina e Excelência') on conflict do nothing;
insert into public.institutional_content(id,title,body,mission,values_text) values
(1,'Uma unidade. Um compromisso.',
'A Unidade de Segurança e Honras do Estado integra a estrutura de segurança da cidade Diamond, num contexto de roleplay inspirado na GNR. Reúne elementos preparados para missões de proteção institucional, segurança de eventos e honras de Estado. A hierarquia, a formação e o espírito de equipa orientam cada ativação.',
'Garantir a proteção das instituições e dos seus representantes, apoiar a segurança da cidade e dignificar as cerimónias oficiais com rigor e prontidão.',
'Honra — agir com integridade e respeito.\nDisciplina — cumprir as ordens legítimas e os procedimentos.\nExcelência — procurar a melhoria contínua.\nLealdade — colocar o serviço e a equipa em primeiro lugar.') on conflict do nothing;
insert into public.members(uniform_number,name,callsign,rank) values
(1,'Duarte Petinga','K-10','Comando'),(2,'Diogo Oconner','','Comando'),
(3,'Noah Bolachas','','Primeiro Oficial'),(4,'João Barbosa','Z-11','Primeiro Oficial'),
(5,'Sérgio Faisca','','Oficial'),(6,'Francisco Andrade','Z-03','Oficial'),
(7,'Nando Penetra','','Sargento'),(8,'Miguel Medeiros','','Sargento'),
(9,'Matatuky Bolachas','Z-10','Operacional'),(10,'Chico Rato','Z-08','Operacional'),
(11,'Mike Almeida','G-07','Operacional'),(12,'José Horácio','Z-14','Operacional'),
(13,'Chicken Thunder','Z-17','Operacional'),(14,'Fox Oconner','G-06','Operacional'),
(15,'Zé Bisca','G-10','Operacional'),(16,'Cremilda Santos','Z-16','Operacional'),
(20,'Tiago Cavrito','G-02','Estagiário'),(21,'André Oconner','Z-15','Estagiário'),
(99,'Smurf Oliveira','','Quadros Permanentes'),(98,'Xexxi Silveira','','Quadros Permanentes'),
(97,'Marco Santos','','Quadros Permanentes'),(96,'Vasco Martins','','Quadros Permanentes') on conflict do nothing;
insert into public.announcements(id,title,body,kind,author_name,created_at) values
('a0000000-0000-4000-8000-000000000001','Comunicado Oficial: mudança de Sub-Comandante',
'Informa-se que João Barbosa deixa o Comando e passa a Primeiro Oficial. A composição atual do Comando encontra-se na secção Equipa.\n\nCumprimentos,\nDuarte Petinga\nComandante USHE.',
'Comunicado Oficial','Duarte Petinga · Comandante','2026-10-18T19:06:00+01:00'),
('a0000000-0000-4000-8000-000000000002','Evento Ocean Vibe · 23 de outubro',
'Evento Ocean Vibe, sexta-feira, dia 23/10/2026, pelas 21:00, no Código E. Indica a tua disponibilidade na secção Eventos.',
'Evento','Duarte Petinga · Comandante','2026-10-17T20:52:00+01:00') on conflict do nothing;
insert into public.events(id,title,description,starts_at,ends_at,location) values
('e0000000-0000-4000-8000-000000000001','Evento Ocean Vibe','Segurança do evento Ocean Vibe. Confirma a tua disponibilidade. Hora de fim exemplificativa; a confirmar pelo Comando.',
'2026-10-23T21:00:00+01:00','2026-10-23T23:00:00+01:00','Código E') on conflict do nothing;
insert into public.warnings(id,title,conduct,sanction,issued_on) values
('b0000000-0000-4000-8000-000000000001','1ª REPREENSÃO ESCRITA','a) Não resposta a anúncio solicitado pelo Comando.','1º Aviso','2026-10-22') on conflict do nothing;
insert into public.warning_members(warning_id,member_id)
select 'b0000000-0000-4000-8000-000000000001',id from public.members where uniform_number in (20,6) on conflict do nothing;
insert into public.uniforms(id,name,pieces,sort_order) values
('c0000000-0000-4000-8000-000000000001','Comando e Primeiro Oficial','{"Máscaras":"121","Lenços e Correntes":"224","Casacos":"322","T-Shirt":"192-3","Colete":"75","Mãos":"33","Calças":"28","Sapatos":"10","Chapéus":"261"}',1),
('c0000000-0000-4000-8000-000000000002','Oficial','{"Máscaras":"121","Lenços e Correntes":"224","Casacos":"610-6","T-Shirt":"N/A","Colete":"75","Mãos":"33","Calças":"28","Sapatos":"10","Chapéus":"261"}',2) on conflict do nothing;
insert into public.equipment(id,name,category,mandatory,notes,sort_order) values
('d0000000-0000-4000-8000-000000000001','Shotgun Borracha','Obrigatório',true,'Em qualquer ativação da unidade.',1),
('d0000000-0000-4000-8000-000000000002','Taser','Obrigatório',true,'',2),
('d0000000-0000-4000-8000-000000000003','Lanterna','Obrigatório',true,'',3),
('d0000000-0000-4000-8000-000000000004','Cacetete','Obrigatório',true,'',4),
('d0000000-0000-4000-8000-000000000005','Algemas','Obrigatório',true,'',5),
('d0000000-0000-4000-8000-000000000006','Rádio','Obrigatório',true,'',6),
('d0000000-0000-4000-8000-000000000007','50x Balas Borracha','Obrigatório',true,'',7),
('d0000000-0000-4000-8000-000000000008','Telemóvel','Obrigatório',true,'',8),
('d0000000-0000-4000-8000-000000000009','SMG','Opcional',false,'Operacional ou patente superior.',9),
('d0000000-0000-4000-8000-000000000010','Equipamento autorizado pela GNR','Opcional',false,'Todo o equipamento autorizado à patente do elemento na GNR.',10) on conflict do nothing;
-- Modelo: substituir e aprovar o regulamento antes da utilização operacional.
insert into public.regulations(id,chapter,article_number,title,body) values
('f0000000-0000-4000-8000-000000000001','I · Disposições Gerais',1,'Âmbito e missão','MODELO A VALIDAR PELO COMANDO. O presente regulamento enquadra a organização e o funcionamento da USHE na cidade Diamond, exclusivamente em contexto de roleplay.'),
('f0000000-0000-4000-8000-000000000002','II · Hierarquia',2,'Cadeia de comando','MODELO A VALIDAR PELO COMANDO. Os elementos respeitam a cadeia de comando e utilizam os canais definidos para pedidos, ordens e comunicações.'),
('f0000000-0000-4000-8000-000000000003','III · Deveres',3,'Prontidão e comunicação','MODELO A VALIDAR PELO COMANDO. Cada elemento mantém o seu equipamento preparado e responde aos pedidos de disponibilidade, mesmo quando não pode participar.'),
('f0000000-0000-4000-8000-000000000004','IV · Conduta e Sanções',4,'Disciplina e registo','MODELO A VALIDAR PELO COMANDO. As infrações são apreciadas pelo Comando. As decisões identificam os visados, a conduta, a sanção e a data, ficando registadas na secção Avisos.'),
('f0000000-0000-4000-8000-000000000005','V · Equipamento e Fardamento',5,'Apresentação e material','MODELO A VALIDAR PELO COMANDO. Os elementos utilizam o fardamento da sua patente e verificam o equipamento obrigatório antes de cada ativação.') on conflict do nothing;
commit;
