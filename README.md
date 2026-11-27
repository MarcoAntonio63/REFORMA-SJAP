# Vistoria JFAP — Prédio Sede (app)

Aplicativo web (PWA, funciona offline e pode ser instalado no celular) criado a partir da
**Planilha Unificada de Vistoria por Estação** (versão atual: `Planilha_Unificada_Vistoria_JFAP_1.xlsx`)
da Seção Judiciária do Amapá.
Todo o conteúdo da planilha foi mantido: 28 estações (01–29, sem a 04), 581 itens
(parâmetros P01–P09 e itens ViP), LEIA-ME, ÍNDICE, legendas, método e decisões e as
regras de cálculo da aba RESUMO.

## Funcionalidades

**Registro em campo (por estação)**
- Identificação: data, vistoriador, acompanhante, hora de início/término (botão “Agora”; data,
  hora de início e equipe padrão são preenchidas sozinhas ao começar).
- Ficha do local (representa também, parâmetros/ViP aplicáveis, representatividade) e foco da vistoria.
- P01–P09: avaliação por botões 5·4·3·2·1·N/V·N/A, **nota calculada automaticamente**, observação,
  prioridade sugerida (preenchida conforme a nota e editável) e alerta crítico.
- Blocos condicionais (X*): pergunta “a condição se confirmou em campo?” — se “Não”, o bloco não é pontuado
  (sai como N/A na planilha).
- P03.1 é calculado pela média dos sub-quesitos P03.1a–c.
- ViP: situação B/R/C/NA/NI (C marca o alerta crítico automaticamente), observação, alerta.
- Estações de registro livre (02, 03) com campo de anotações; estação 29 exclusivamente ViP.
- Fechamento: verificado P/ViP (com sugestão automática), observações, pendências, faixa de fotos automática
  e **assinatura na tela**.
- Botão “Próximo item pendente”, navegação entre estações, filtro por pavimento e busca.

**Fotos**
- Botão 📷 em cada item (abre a câmera do celular) e “Galeria”; fotos gerais do local.
- Numeração única e crescente para todo o prédio (001, 002…) e nome no padrão
  `JFAP_L<estação>_F<foto>` (ex.: `JFAP_L06_F012`), conforme o LEIA-ME.
- A coluna “Fotos / Evidências (nº)” é preenchida automaticamente.
- Carimbo opcional gravado na imagem (nome, item, estação, data e hora); redimensionamento configurável.
- Legenda, troca do item vinculado, exclusão (sem renumerar as demais) e galeria por estação.

**Resumo** — reproduz a aba RESUMO: cobertura, média, alertas e prioridade por bloco e por estação
(≥4,5 Manter · ≥3,5 Melhoria pontual · ≥2,5 Programar melhoria · <2,5 Intervenção prioritária), com
alerta crítico prevalecendo sobre a média; média por parâmetro em todo o prédio, situação ViP
(B=0, R=2, C=5 pontos), lista de alertas críticos e de pendências.

**Exportação**
- **Planilha Excel preenchida**: a própria planilha REV2 (mesmas abas, formatação, listas suspensas e
  fórmulas do RESUMO, que passam a calcular) com todas as respostas, notas, números de fotos, status no
  ÍNDICE, assinatura e uma aba **FOTOS** com as imagens.
- **Relatório PDF** (impressão → “Salvar como PDF”) com capa, resumo, resultados por estação e fotos.
- **ZIP de fotos** nomeadas + índice CSV; **pacote completo** (Excel + fotos + backup).
- **Backup/restauração (.json)** para não perder dados ou continuar em outro aparelho.

Os dados ficam salvos **somente no dispositivo** (IndexedDB). Faça backups com frequência.

## Importar respostas de uma planilha

Em **Exportar → Importar respostas de uma planilha**, escolha um .xlsx de vistoria (por exemplo, uma
planilha preenchida no Excel). O app traz identificação, avaliações, observações, prioridades, alertas,
situação ViP, anotações e fechamento. Só os campos preenchidos na planilha são importados; o restante
do app é mantido. Fotos não vêm junto — os números da coluna “Fotos / Evidências” ficam como referência
(“planilha: …”). Blocos condicionais avaliados com notas são marcados como “condição confirmada”.

## Textos dos quesitos

A partir da planilha `_1`, todas as perguntas de avaliação e orientações “O que observar” (P01–P09)
vêm da própria planilha. Se uma versão futura vier sem algum texto, o app volta a oferecer
**Mais → Textos dos quesitos** para completá-lo.

## Como usar

O app é estático (HTML/JS, sem servidor). A câmera exige HTTPS:

1. **GitHub Pages** (recomendado): em *Settings → Pages → Source*, escolha **GitHub Actions**; o
   workflow `.github/workflows/pages.yml` publica a pasta `app/` a cada push na `main` (ou rode-o
   manualmente em *Actions*). Abra o endereço no celular e use “Adicionar à tela inicial”.
2. **Local** (teste no computador): `cd app && python3 -m http.server 8000` e abra `http://localhost:8000`.

## Estrutura

```
app/
  index.html, css/app.css, manifest.webmanifest, sw.js (offline), icons/
  js/data.js     conteúdo da planilha (gerado — não editar)
  js/calc.js     regras de cálculo (RESUMO)
  js/app.js      interface e registro de campo
  js/fotos.js    captura, carimbo e miniaturas
  js/export.js   Excel, PDF, ZIP e backup
  js/db.js       armazenamento local (IndexedDB)
  modelo/        planilha de vistoria sem respostas (modelo da exportação)
  vendor/        ExcelJS 4.4.0 e JSZip 3.10.1 (MIT)
tools/extrair_planilha.py   regenera js/data.js a partir da planilha
```

Se a planilha for revisada, rode (o 3º argumento grava o modelo sem respostas, para que dados de
campo não fiquem no repositório):

```bash
python3 tools/extrair_planilha.py <nova_planilha.xlsx> app/js/data.js app/modelo/modelo_vistoria_JFAP.xlsx
```

Depois aumente `VERSAO` em `app/sw.js` para que os aparelhos recebam a atualização.
