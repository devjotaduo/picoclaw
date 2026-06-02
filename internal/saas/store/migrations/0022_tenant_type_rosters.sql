-- v2.0: enrich tenant_types.roster_json from the flat ["attendant","assistant"]
-- placeholder to object specs {id,role,label,desc,locked} so each type carries
-- the named agents it is born with (panel_enabled at provision) and the wizard
-- can show a per-agent description. Idempotent UPDATEs by slug; publico keeps
-- Sofia solo, admin stays empty, cliente/verticals get the rafael+clara default.

UPDATE tenant_types SET roster_json = '[
  {"id":"sofia","role":"discovery","label":"Sofia — Discovery","desc":"Conduz a descoberta com o visitante anônimo.","locked":true}
]' WHERE slug = 'publico';

UPDATE tenant_types SET roster_json = '[]' WHERE slug = 'admin';

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende clientes no WhatsApp: triagem, dúvidas e encaminhamento.","locked":true}
]' WHERE slug IN ('cliente', 'atendimento-geral');

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende pacientes no WhatsApp: triagem, dúvidas e agendamento.","locked":true},
  {"id":"camila","role":"especialista","label":"Camila — Pós-atendimento","desc":"Lembretes de consulta, confirmações e retorno de pacientes."}
]' WHERE slug = 'clinica';

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende clientes no WhatsApp: triagem, dúvidas e suporte.","locked":true},
  {"id":"marcos","role":"especialista","label":"Marcos — Vendas","desc":"Qualifica leads, apresenta catálogo e fecha vendas."}
]' WHERE slug IN ('loja', 'restaurante', 'imobiliaria');

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende clientes no WhatsApp: triagem, agendamento e dúvidas.","locked":true},
  {"id":"marcos","role":"especialista","label":"Marcos — Vendas","desc":"Qualifica leads e fecha orçamentos."},
  {"id":"lia","role":"especialista","label":"Lia — Marketing","desc":"Posts, campanhas e materiais visuais para divulgação."}
]' WHERE slug = 'servicos';
