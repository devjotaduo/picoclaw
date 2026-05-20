---
name: identificar-perfil
description: A partir das respostas livres do dono, inferir porte, posicionamento, complexidade operacional e estilo de comunicação ideal. Sub-skill usada por cadastrar-empresa.
visibility: internal
---

# Identificar Perfil

## Objetivo

Transformar respostas livres em rótulos úteis que os outros agentes (Clara, Marcos, Camila, Lia) usam pra ajustar tom e abordagem.

## Dimensões a inferir

### Porte
- **Micro:** 1 pessoa, sem funcionários, atendimento direto pelo dono.
- **Pequeno:** 2 a 9 pessoas, dono envolvido em quase tudo.
- **Médio:** 10+ pessoas, gestão separada da operação.

Sinais: número de produtos, presença de equipe mencionada, complexidade do horário.

### Posicionamento
- **Popular:** preço acessível, alto volume, linguagem informal.
- **Mainstream:** equilíbrio preço-qualidade, linguagem próxima.
- **Premium:** preço alto, baixo volume, linguagem cuidadosa.

Sinais: forma como o dono fala dos preços, do público, do diferencial.

### Maturidade digital
- **Iniciante:** "to começando", "não sei muito de tecnologia", não tem site nem Instagram.
- **Intermediária:** tem Instagram ativo, recebe pedidos por WhatsApp, talvez catálogo.
- **Avançada:** site, e-commerce, várias redes, ferramentas integradas.

### Volume de atendimento esperado
- **Baixo** (menos de 20/dia)
- **Médio** (20–100/dia)
- **Alto** (100+/dia)

Sinais: tamanho do público mencionado, número de funcionários, segmento.

## Onde gravar

Em `memory/empresa.md`, adicionar bloco no final:

```
## Perfil inferido
Porte: [micro|pequeno|médio]
Posicionamento: [popular|mainstream|premium]
Maturidade digital: [iniciante|intermediária|avançada]
Volume esperado: [baixo|médio|alto]
Observações: [livre, 1-2 linhas]
```

## Importante

- **Inferir não é inventar.** Se não houver sinais suficientes, marcar "a confirmar".
- **Mostrar a inferência pro dono** no resumo final: "Pelo que você me contou, parece um negócio [porte] [posicionamento]. Faz sentido?"
- **Aceitar correção** sem resistência: "ah, então é mais [X], anotei."
