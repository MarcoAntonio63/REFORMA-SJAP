#!/usr/bin/env python3
"""Extrai todo o conteúdo da Planilha Unificada de Vistoria JFAP (REV2) para
app/js/data.js, usado pelo aplicativo de vistoria.

Uso:  python3 tools/extrair_planilha.py <planilha.xlsx> [saida.js]
"""
import json, re, sys
import openpyxl


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.replace("\xa0", " ").strip()
        v = re.sub(r"[ \t]+", " ", v)
        if v.startswith("="):          # fórmula quebrada na planilha de origem
            return None
        return v or None
    return v


def station_sheet(ws, index_row):
    g = lambda c: clean(ws[c].value)
    st = {
        "num": index_row["num"],
        "aba": ws.title,
        "titulo": g("A1"),
        "subtitulo": g("A2"),
        "pavimento": index_row["pavimento"],
        "ambiente": index_row["ambiente"],
        "tipoVerificacao": index_row["tipo"],
        "parametrosAplicaveis": index_row["parametros"],
        "vipAplicaveis": index_row["vip"],
        "nQuesitos": index_row["nq"],
        "info": {},
        "foco": None,
        "registroLivre": None,
        "blocos": [],
        "notas": None,
    }
    rows = list(ws.iter_rows(min_row=1, max_row=ws.max_row))
    i = 0
    n = len(rows)
    while i < n:
        a = clean(rows[i][0].value)
        if a in ("Representa também", "Parâmetros aplicáveis", "Itens ViP aplicáveis",
                 "Representatividade preliminar"):
            st["info"][a] = clean(rows[i][2].value)
        elif a == "Data da vistoria":
            st["linhaIdent"] = i + 2          # valores na linha abaixo dos rótulos (A,C,E,G,I)
        elif a == "Anotações de campo:":
            st["linhaAnotacoes"] = i + 2
        elif a in ("Verificado P01–P09", "Verificado ViP", "Observações gerais da estação",
                   "Pendências / retornar", "Fotos da estação (faixa de numeração)",
                   "Assinatura do vistoriador"):
            st.setdefault("linhasFechamento", {})[a] = i + 1
        elif a == "FOCO DA VISTORIA NESTE LOCAL":
            st["foco"] = clean(rows[i + 1][0].value)
        elif a and a.startswith("Estação ") and ("registro livre" in a or "exclusivamente ViP" in a):
            st["registroLivre"] = a
        elif a and a.startswith("Notas:"):
            st["notas"] = a
        elif a == "Código":
            hdr_b = clean(rows[i][1].value)
            titulo = clean(rows[i - 1][0].value)
            tipo = "P" if hdr_b == "Indicador / dimensão" else "ViP"
            m = re.match(r"^(P\d\d|ViP \d\d)", titulo or "")
            bloco = {
                "tipo": tipo,
                "titulo": titulo,
                "codigo": m.group(1) if m else titulo,
                "condicional": bool(titulo and ("condicional" in titulo.lower())),
                "checagem": bool(titulo and ("checagem" in titulo.lower())),
                "linhaTitulo": i,
                "itens": [],
            }
            j = i + 1
            while j < n and clean(rows[j][0].value) and clean(rows[j][0].value) != "Código":
                r = rows[j]
                cod = clean(r[0].value)
                if tipo == "P":
                    if re.match(r"^P\d\d\.\d+[a-z]$", cod):
                        # sub-quesito (ex.: P03.1a): pergunta na col. B, orientação na col. C
                        it = {"codigo": cod, "indicador": None, "pergunta": clean(r[1].value),
                              "observar": clean(r[2].value), "sub": True}
                    else:
                        it = {"codigo": cod, "indicador": clean(r[1].value),
                              "pergunta": clean(r[2].value), "observar": clean(r[3].value)}
                else:
                    it = {"codigo": cod, "item": clean(r[1].value), "verificar": clean(r[2].value)}
                it["linha"] = j + 1
                bloco["itens"].append(it)
                j += 1
            st["blocos"].append(bloco)
            i = j
            continue
        i += 1
    return st


def main(src, out):
    wb = openpyxl.load_workbook(src)
    g = lambda ws, c: clean(ws[c].value)

    # ÍNDICE
    wi = wb["ÍNDICE"]
    indice = {}
    for r in wi.iter_rows(min_row=3, max_row=30):
        if isinstance(r[0].value, int):
            indice[clean(r[8].value)] = {
                "num": r[0].value, "pavimento": clean(r[1].value), "ambiente": clean(r[2].value),
                "tipo": clean(r[3].value), "parametros": clean(r[4].value), "vip": clean(r[5].value),
                "nq": r[6].value,
            }

    # LEIA-ME
    wl = wb["LEIA-ME"]
    leiame = {"titulo": g(wl, "B1"), "orgao": g(wl, "B2"), "endereco": g(wl, "B3"), "secoes": []}
    for r in wl.iter_rows(min_row=5):
        if r[0].value:
            leiame["secoes"].append({"titulo": clean(r[0].value), "texto": None})
        elif r[1].value and leiame["secoes"]:
            leiame["secoes"][-1]["texto"] = clean(r[1].value)

    # LEGENDA_PARAMETROS
    wp = wb["LEGENDA_PARAMETROS"]
    parametros, escala = [], []
    for r in wp.iter_rows(min_row=3, max_row=11):
        parametros.append({"codigo": clean(r[0].value), "nome": clean(r[1].value), "aplicacao": clean(r[2].value)})
    for r in wp.iter_rows(min_row=14, max_row=20):
        escala.append({"valor": str(clean(r[0].value)), "descricao": clean(r[1].value)})

    # LEGENDA_VIP
    wv = wb["LEGENDA_VIP"]
    vip = {"escala": g(wv, "A2"), "itens": []}
    for r in wv.iter_rows(min_row=5):
        if r[0].value:
            vip["itens"].append({"codigo": clean(r[0].value), "tipologia": clean(r[1].value),
                                 "item": clean(r[2].value), "verificar": clean(r[3].value)})

    # METODO_E_DECISOES
    wm = wb["METODO_E_DECISOES"]
    metodo = [{"tema": clean(r[0].value), "decisao": clean(r[1].value)}
              for r in wm.iter_rows(min_row=3) if r[0].value]

    # Listas suspensas (validação de dados) — retiradas da aba 01
    ws1 = wb[wb.sheetnames[1]]
    listas = {}
    for dv in ws1.data_validations.dataValidation:
        vals = [v.strip() for v in dv.formula1.strip('"').split(",")]
        if vals[0].startswith("5"):
            listas["avaliacao"] = vals
        elif vals[0] == "Manter":
            listas["prioridade"] = vals
        elif vals[0].startswith("B"):
            listas["situacao"] = vals
        elif vals == ["Não", "Sim"]:
            listas["alerta"] = vals

    estacoes = [station_sheet(wb[aba], indice[aba]) for aba in indice]
    fech = [clean(r[0].value) for r in wb[wb.sheetnames[1]].iter_rows(min_row=56, max_row=61)]

    data = {
        "fonte": src.split("/")[-1],
        "titulo": g(wi, "A1"),
        "leiame": leiame,
        "parametros": parametros,
        "escala": escala,
        "vip": vip,
        "metodo": metodo,
        "listas": listas,
        "camposFechamento": fech,
        "estacoes": estacoes,
    }
    js = "/* Gerado por tools/extrair_planilha.py a partir de %s — não editar à mão. */\n" % data["fonte"]
    js += "window.VISTORIA_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(out, "w", encoding="utf-8").write(js)
    tot = sum(len(it["itens"]) for e in estacoes for it in e["blocos"])
    semtexto = sorted({it["codigo"] for e in estacoes for b in e["blocos"] if b["tipo"] == "P"
                       for it in b["itens"] if not it.get("pergunta")})
    print(f"{len(estacoes)} estações, {tot} itens. Quesitos sem texto na planilha: {', '.join(semtexto)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "app/js/data.js")
