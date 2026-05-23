from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import cm

out = 'output/lista_cores.pdf'
c = canvas.Canvas(out, pagesize=A4)
w, h = A4
c.setTitle('Lista de Cores')
c.setFont('Helvetica-Bold', 20)
c.drawString(2*cm, h-2.5*cm, 'Lista de Cores')
items = [
    ('Vermelho', colors.red),
    ('Azul', colors.blue),
    ('Verde', colors.green),
    ('Amarelo', colors.yellow),
    ('Laranja', colors.orange),
    ('Roxo', colors.purple),
    ('Rosa', colors.pink),
    ('Marrom', colors.brown),
    ('Cinza', colors.grey),
    ('Preto', colors.black),
    ('Branco', colors.white),
]
y = h - 4*cm
c.setFont('Helvetica', 12)
for nome, cor in items:
    c.setFillColor(cor)
    c.rect(2*cm, y-0.2*cm, 1.2*cm, 0.6*cm, fill=1, stroke=1)
    c.setFillColor(colors.black)
    x_texto = 3.6*cm if nome != 'Preto' else 4.0*cm
    c.drawString(x_texto, y, nome)
    y -= 1*cm
c.save()
print(out)
