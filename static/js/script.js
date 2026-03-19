// ==========================================
// VARS GLOBS
// ==========================================
let selectedType = "";
let matriculaHashSessao = "";
let protocoloEmEdicao = ""; // Guarda o protocolo aberto na modal

function showMessage(text, isSuccess = false) {
  const box = document.getElementById("message-box");
  if (!box) return;
  box.innerText = text;
  box.style.backgroundColor = isSuccess ? "#38a169" : "#e53e3e";
  box.style.display = "block";
  setTimeout(() => {
    box.style.display = "none";
  }, 4000);
}

function redirecionar(tipo) {
  window.location.href = `/${tipo === "aluno" ? "denuncia" : "pedagogia"}`;
}

// ==========================================
// LÓGICA DO ALUNO
// ==========================================
function goToPageAluno(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");
}

function selectType(element, type) {
  document
    .querySelectorAll(".option-item")
    .forEach((opt) => opt.classList.remove("selected"));
  element.classList.add("selected");
  selectedType = type;
}

async function handleLoginAluno() {
  const matricula = document.getElementById("login-id").value.trim();
  if (!matricula) {
    showMessage("Digite a matrícula.", false);
    return;
  }
  try {
    const res = await fetch("/api/verificar_matricula", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matricula }),
    });
    const data = await res.json();
    if (data.permitido) {
      matriculaHashSessao = data.hash;
      goToPageAluno("2");
    } else {
      showMessage(data.mensagem, false);
    }
  } catch (e) {
    showMessage("Erro no servidor.", false);
  }
}

async function finishDenuncia() {
  const local = document.getElementById("local").value.trim();
  const desc = document.getElementById("descricao").value.trim();
  const agressor = document.getElementById("agressor").value.trim();
  const arquivos = document.getElementById("arquivo-evidencia");
  const btnSubmit = document.getElementById("btn-finalizar");

  if (!selectedType) {
    showMessage("Selecione o tipo.", false);
    return;
  }
  if (!local || !desc) {
    showMessage("Preencha local e ocorrido.", false);
    return;
  }

  const formData = new FormData();
  formData.append("matricula_hash", matriculaHashSessao);
  formData.append("tipo_violencia", selectedType);
  formData.append("local_ocorrido", local);
  formData.append("descricao", desc);
  formData.append("agressor", agressor);
  for (let i = 0; i < arquivos.files.length; i++)
    formData.append("arquivos", arquivos.files[i]);

  btnSubmit.innerText = "Enviando...";
  btnSubmit.disabled = true;

  try {
    const res = await fetch("/api/enviar_denuncia", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.sucesso) {
      document.getElementById("protocol-number").innerText = data.protocolo;
      goToPageAluno("4");
    } else {
      showMessage(data.erro, false);
    }
  } catch (e) {
    showMessage("Falha no envio.", false);
  } finally {
    btnSubmit.innerText = "Enviar Denúncia";
    btnSubmit.disabled = false;
  }
}

// ==========================================
// LÓGICA DA PEDAGOGIA
// ==========================================
async function fazerLoginPedagogia() {
  const user = document.getElementById("admin-user").value.trim();
  const pass = document.getElementById("admin-pass").value.trim();
  const btnLogin = document.querySelector("#admin-login-screen button");

  if (!user || !pass) {
    showMessage("Preencha os campos.", false);
    return;
  }
  btnLogin.innerText = "Autenticando...";
  btnLogin.disabled = true;

  try {
    const res = await fetch("/api/login_admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: user, senha: pass }),
    });
    const data = await res.json();
    if (data.sucesso) {
      document.getElementById("admin-login-screen").classList.add("hidden");
      document
        .getElementById("admin-dashboard-screen")
        .classList.remove("hidden");
      carregarTabelaDashboard();
      carregarEstatisticas(); // Chama a nova função de números
    } else {
      showMessage(data.mensagem, false);
    }
  } catch (e) {
    showMessage("Erro de conexão.", false);
  } finally {
    btnLogin.innerText = "Entrar no Sistema";
    btnLogin.disabled = false;
  }
}

function sairPedagogia() {
  document.getElementById("admin-user").value = "";
  document.getElementById("admin-pass").value = "";
  document.getElementById("admin-dashboard-screen").classList.add("hidden");
  document.getElementById("admin-login-screen").classList.remove("hidden");
}

async function carregarEstatisticas() {
  try {
    const res = await fetch("/api/dashboard_stats");
    const stats = await res.json();
    document.getElementById("stat-total").innerText = stats["Total"] || 0;
    document.getElementById("stat-nova").innerText = stats["Nova"] || 0;
    document.getElementById("stat-concluida").innerText =
      stats["Concluída"] || 0;
    document.getElementById("stat-fraude").innerText =
      stats["Suspeita de Fraude"] || 0;
  } catch (e) {
    console.error("Erro ao puxar stats", e);
  }
}

async function carregarTabelaDashboard() {
  const tbody = document.getElementById("tabela-admin-corpo");
  try {
    const res = await fetch("/api/listar_denuncias");
    const denuncias = await res.json();
    tbody.innerHTML = "";
    if (denuncias.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="py-4 text-center">Nenhuma denúncia.</td></tr>';
      return;
    }

    denuncias.forEach((d) => {
      let badge = "";
      if (d.status_triagem === "Nova")
        badge =
          '<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-bold">Nova</span>';
      else if (d.status_triagem === "Em Análise")
        badge =
          '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-bold">Análise</span>';
      else if (d.status_triagem === "Suspeita de Fraude")
        badge =
          '<span class="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-bold">Fraude</span>';
      else
        badge =
          '<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-bold">Concluída</span>';

      tbody.innerHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="py-3 px-6 font-semibold text-blue-600">#${d.protocolo}</td>
                    <td class="py-3 px-6 text-sm text-gray-600">${d.data_formatada}</td>
                    <td class="py-3 px-6 text-sm text-gray-700 font-medium">${d.tipo_violencia}</td>
                    <td class="py-3 px-6">${badge}</td>
                    <td class="py-3 px-6">
                        <button onclick="abrirModal('${d.protocolo}')" class="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded hover:bg-blue-600 hover:text-white transition-colors text-sm">Ver</button>
                    </td>
                </tr>`;
    });
  } catch (e) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center text-red-500">Erro no banco de dados.</td></tr>';
  }
}

// Lógica da Janela Modal
async function abrirModal(protocolo) {
  protocoloEmEdicao = protocolo;
  const modal = document.getElementById("modal-denuncia");

  // Mostra Carregando
  document.getElementById("modal-protocolo").innerText = "Carregando...";
  modal.classList.remove("hidden");

  try {
    const res = await fetch(`/api/denuncia/${protocolo}`);
    const data = await res.json();

    if (data.sucesso) {
      const d = data.denuncia;
      document.getElementById("modal-protocolo").innerText = d.protocolo;
      document.getElementById("modal-data").innerText = d.data_formatada;
      document.getElementById("modal-tipo").innerText = d.tipo_violencia;
      document.getElementById("modal-local").innerText = d.local_ocorrido;
      document.getElementById("modal-agressor").innerText =
        d.nomes_agressores || "Não Informado";
      document.getElementById("modal-descricao").innerText = d.descricao;
      document.getElementById("modal-status").value = d.status_triagem;

      // Renderiza os botões para baixar os arquivos
      const evDiv = document.getElementById("modal-evidencias");
      evDiv.innerHTML = "";
      if (data.evidencias.length === 0) {
        evDiv.innerHTML =
          '<span class="text-sm text-gray-400 italic">Nenhuma prova anexada.</span>';
      } else {
        data.evidencias.forEach((ev, i) => {
          // Cria um botão que abre o arquivo em outra aba
          evDiv.innerHTML += `
                        <a href="/static/${ev.caminho_arquivo}" target="_blank" class="bg-white border border-gray-300 px-3 py-2 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-2 shadow-sm">
                            <i class="fa-solid fa-paperclip"></i> Anexo ${i + 1} (${ev.tipo_arquivo})
                        </a>
                    `;
        });
      }
    }
  } catch (e) {
    showMessage("Erro ao carregar detalhes.", false);
    fecharModal();
  }
}

function fecharModal() {
  document.getElementById("modal-denuncia").classList.add("hidden");
  protocoloEmEdicao = "";
}

async function salvarStatus() {
  const novoStatus = document.getElementById("modal-status").value;

  try {
    const res = await fetch("/api/atualizar_status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocolo: protocoloEmEdicao,
        novo_status: novoStatus,
      }),
    });
    const data = await res.json();

    if (data.sucesso) {
      showMessage("Status atualizado com sucesso!", true);
      fecharModal();
      carregarTabelaDashboard(); // Recarrega a tabela
      carregarEstatisticas(); // Recarrega os números do topo
    }
  } catch (e) {
    showMessage("Erro ao salvar.", false);
  }
}
