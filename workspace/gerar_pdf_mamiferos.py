from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib import colors
from pathlib import Path

out = Path('mamiferos_apresentacao.pdf')

doc = SimpleDocTemplate(str(out), pagesize=A4,
                        rightMargin=50, leftMargin=50,
                        topMargin=50, bottomMargin=50)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TituloCentro', parent=styles['Title'], alignment=TA_CENTER, textColor=colors.darkblue, fontSize=24, leading=28))
styles.add(ParagraphStyle(name='Subtitulo', parent=styles['Heading2'], textColor=colors.darkgreen, spaceAfter=12))
styles.add(ParagraphStyle(name='Texto', parent=styles['BodyText'], fontSize=12, leading=17, spaceAfter=10))

story = []
story.append(Paragraph('Mamíferos', styles['TituloCentro']))
story.append(Spacer(1, 18))
story.append(Paragraph('Apresentação escolar', styles['Heading2']))
story.append(Spacer(1, 24))
story.append(Paragraph('Os mamíferos são animais vertebrados muito importantes para a natureza e para a vida humana. Eles podem viver em ambientes terrestres, aquáticos e até aéreos, como é o caso dos morcegos.', styles['Texto']))
story.append(Paragraph('Nesta apresentação, vamos conhecer suas principais características, exemplos e curiosidades.', styles['Texto']))
story.append(PageBreak())

slides = [
    ('O que são mamíferos?', [
        'Mamíferos são animais vertebrados.',
        'A maioria nasce do ventre da mãe.',
        'Eles mamam quando filhotes, recebendo leite materno.',
        'Seu corpo normalmente possui pelos em alguma fase da vida.'
    ]),
    ('Principais características', [
        'Possuem glândulas mamárias, que produzem leite.',
        'Têm sangue quente, mantendo a temperatura do corpo estável.',
        'Respiram por pulmões.',
        'Apresentam cérebro bem desenvolvido em comparação com muitos outros animais.'
    ]),
    ('Onde vivem?', [
        'Em florestas, savanas, desertos, rios, oceanos e cidades.',
        'Alguns vivem em árvores, como macacos.',
        'Outros vivem no mar, como baleias e golfinhos.',
        'Também existem mamíferos voadores, como os morcegos.'
    ]),
    ('Exemplos de mamíferos', [
        'Cachorro',
        'Gato',
        'Elefante',
        'Leão',
        'Baleia',
        'Golfinho',
        'Morcego',
        'Ser humano'
    ]),
    ('Alimentação', [
        'Alguns mamíferos são herbívoros, como vaca e cavalo.',
        'Outros são carnívoros, como leão e tigre.',
        'Também existem onívoros, como urso e ser humano, que comem alimentos de origem vegetal e animal.'
    ]),
    ('Reprodução', [
        'A maioria dos mamíferos é vivípara, ou seja, os filhotes nascem do corpo da mãe.',
        'Existem exceções, como ornitorrinco e equidna, que botam ovos.',
        'Após o nascimento, os filhotes dependem do leite materno.'
    ]),
    ('Importância dos mamíferos', [
        'Ajudam no equilíbrio dos ecossistemas.',
        'Alguns espalham sementes e contribuem para a natureza.',
        'Muitos fazem parte da alimentação, do transporte e da companhia humana.',
        'Várias espécies precisam de proteção contra a caça e a destruição do ambiente.'
    ]),
    ('Curiosidades', [
        'A baleia-azul é o maior mamífero do mundo.',
        'O morcego é o único mamífero com voo verdadeiro.',
        'Os golfinhos são mamíferos marinhos muito inteligentes.',
        'Mesmo vivendo na água, baleias e golfinhos precisam subir à superfície para respirar.'
    ]),
    ('Conclusão', [
        'Os mamíferos são animais diversos, inteligentes e adaptados a muitos ambientes.',
        'Suas características principais são o leite materno, os pelos e a respiração pulmonar.',
        'Estudar os mamíferos é importante para conhecer melhor a natureza e aprender a preservá-la.'
    ])
]

for titulo, itens in slides:
    story.append(Paragraph(titulo, styles['Subtitulo']))
    for item in itens:
        story.append(Paragraph(f'• {item}', styles['Texto']))
    story.append(PageBreak())

story = story[:-1]
doc.build(story)
print(out.resolve())
