import hashlib
import os
import random
import string
from datetime import datetime

import mysql.connector
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

app = Flask(__name__)

# ==========================================
# CONFIGS E VARS GLOBS
# ==========================================
app.config["UPLOAD_FOLDER"] = "static/uploads/evidencias"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

DB_CONFIG = {
    "host": "localhost",
    "user": "app_protege",
    "password": "senha_segura",  # BEM SEGURA GRAÇAS A DEUS
    "database": "rede_protege",
}


def conectar_banco():
    return mysql.connector.connect(**DB_CONFIG)


def gerar_hash_matricula(matricula):
    return hashlib.sha256(matricula.encode("utf-8")).hexdigest()


def gerar_protocolo():
    agora = datetime.now()
    return f"{agora.strftime('%d%m%Y%H%M')}{''.join(random.choices(string.ascii_uppercase, k=3))}"


# ==========================================
# ROTAS
# ==========================================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/denuncia")
def pagina_denuncia():
    return render_template("denuncia.html")


@app.route("/pedagogia")
def pagina_pedagogia():
    return render_template("pedagogia.html")


# ==========================================
# API: ÁREA DO ALUNO
# ==========================================
@app.route("/api/verificar_matricula", methods=["POST"])
def verificar_matricula():
    matricula_hash = gerar_hash_matricula(request.json.get("matricula"))
    conn = conectar_banco()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT data_ultima_denuncia FROM controle_acesso WHERE matricula_hash = %s",
        (matricula_hash,),
    )
    resultado = cursor.fetchone()
    cursor.close()
    conn.close()

    if resultado and (datetime.now() - resultado["data_ultima_denuncia"]).days < 30:
        dias = 30 - (datetime.now() - resultado["data_ultima_denuncia"]).days
        return jsonify(
            {"permitido": False, "mensagem": f"Aguarde {dias} dias para nova denúncia."}
        )

    return jsonify({"permitido": True, "hash": matricula_hash})


@app.route("/api/enviar_denuncia", methods=["POST"])
def enviar_denuncia():
    try:
        matricula_hash = request.form.get("matricula_hash")
        tipo_violencia = request.form.get("tipo_violencia")
        local_ocorrido = request.form.get("local_ocorrido")
        descricao = request.form.get("descricao")
        agressor = request.form.get("agressor", "Não identificado")

        conn = conectar_banco()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO controle_acesso (matricula_hash, data_ultima_denuncia) VALUES (%s, NOW()) ON DUPLICATE KEY UPDATE data_ultima_denuncia = NOW()",
            (matricula_hash,),
        )

        protocolo = gerar_protocolo()
        arquivos = request.files.getlist("arquivos")
        possui_provas = len(arquivos) > 0 and arquivos[0].filename != ""

        cursor.execute(
            "INSERT INTO denuncias (protocolo, tipo_violencia, local_ocorrido, descricao, nomes_agressores, possui_provas) VALUES (%s, %s, %s, %s, %s, %s)",
            (
                protocolo,
                tipo_violencia,
                local_ocorrido,
                descricao,
                agressor,
                possui_provas,
            ),
        )
        denuncia_id = cursor.lastrowid

        if possui_provas:
            for file in arquivos:
                if file and file.filename != "":
                    nome_final = f"{protocolo}_{secure_filename(file.filename)}"
                    file.save(os.path.join(app.config["UPLOAD_FOLDER"], nome_final))
                    tipo_arq = (
                        "imagem"
                        if file.mimetype.startswith("image/")
                        else "video"
                        if file.mimetype.startswith("video/")
                        else "audio"
                        if file.mimetype.startswith("audio/")
                        else "documento"
                    )
                    cursor.execute(
                        "INSERT INTO evidencias (denuncia_id, caminho_arquivo, tipo_arquivo) VALUES (%s, %s, %s)",
                        (denuncia_id, f"uploads/evidencias/{nome_final}", tipo_arq),
                    )

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"sucesso": True, "protocolo": protocolo})
    except Exception as e:
        return jsonify({"erro": "Erro interno."}), 500


# ==========================================
# API: ÁREA DA PEDAGOGIA
# ==========================================
@app.route("/api/login_admin", methods=["POST"])
def login_admin():
    dados = request.json
    conn = conectar_banco()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM usuarios_admin WHERE usuario = %s AND senha = %s",
        (dados.get("usuario"), dados.get("senha")),
    )
    valido = cursor.fetchone()
    cursor.close()
    conn.close()
    return (
        jsonify({"sucesso": True})
        if valido
        else jsonify({"sucesso": False, "mensagem": "Credenciais incorretas!"})
    )


@app.route("/api/dashboard_stats", methods=["GET"])
def dashboard_stats():
    """Busca as estatísticas para o Dashboard"""
    conn = conectar_banco()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT status_triagem, COUNT(*) as qtd FROM denuncias GROUP BY status_triagem"
    )
    resultados = cursor.fetchall()
    cursor.close()
    conn.close()

    stats = {
        "Total": 0,
        "Nova": 0,
        "Em Análise": 0,
        "Suspeita de Fraude": 0,
        "Concluída": 0,
    }
    for row in resultados:
        stats[row["status_triagem"]] = row["qtd"]
        stats["Total"] += row["qtd"]
    return jsonify(stats)


@app.route("/api/listar_denuncias", methods=["GET"])
def listar_denuncias():
    conn = conectar_banco()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT protocolo, tipo_violencia, status_triagem, DATE_FORMAT(data_registro, '%d/%m/%Y às %H:%i') as data_formatada FROM denuncias ORDER BY data_registro DESC"
    )
    denuncias = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(denuncias)


@app.route("/api/denuncia/<protocolo>", methods=["GET"])
def detalhes_denuncia(protocolo):
    """Busca todos os textos e arquivos de uma denúncia específica pelo protocolo"""
    conn = conectar_banco()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        "SELECT *, DATE_FORMAT(data_registro, '%d/%m/%Y às %H:%i') as data_formatada FROM denuncias WHERE protocolo = %s",
        (protocolo,),
    )
    denuncia = cursor.fetchone()

    if not denuncia:
        cursor.close()
        conn.close()
        return jsonify({"erro": "Denúncia não encontrada"}), 404

    cursor.execute(
        "SELECT caminho_arquivo, tipo_arquivo FROM evidencias WHERE denuncia_id = %s",
        (denuncia["id"],),
    )
    evidencias = cursor.fetchall()

    cursor.close()
    conn.close()
    return jsonify({"sucesso": True, "denuncia": denuncia, "evidencias": evidencias})


@app.route("/api/atualizar_status", methods=["POST"])
def atualizar_status():
    """Permite a pedagoga mudar o status de uma denúncia"""
    dados = request.json
    conn = conectar_banco()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE denuncias SET status_triagem = %s WHERE protocolo = %s",
        (dados.get("novo_status"), dados.get("protocolo")),
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"sucesso": True})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
