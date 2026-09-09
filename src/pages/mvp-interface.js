/**
 * MELITURGOS MVP INTERFACE - Single Page
 * Simple, clean, production-ready UI
 */

export async function onRequestGet() {
  const body = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MELITURGOS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }

    .container {
      width: 100%;
      max-width: 800px;
      min-height: calc(100vh - 40px);
      max-height: 94vh;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .container > * { min-width: 0; }
    .message, #chatStatus, .transcription-preview { overflow-wrap: anywhere; white-space: pre-wrap; }
    button { max-width: 100%; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    :focus-visible { outline: 2px solid #b9c5ff; outline-offset: 3px; }

    .header { text-align: center; margin-top: 8px; }
    .header h1 {
      font-size: 2.25rem;
      font-weight: 300;
      letter-spacing: 2px;
      color: #e0e0e0;
    }

    .mel-avatar-wrapper { display: flex; justify-content: center; margin: 4px 0; }
    .mel-avatar {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform .2s, box-shadow .2s;
      border: 4px solid rgba(255,255,255,.2);
      overflow: hidden;
    }
    .mel-avatar:hover { transform: scale(1.04); box-shadow: 0 10px 40px rgba(102,126,234,.4); }
    .mel-avatar.active { animation: pulse 1.5s infinite; box-shadow: 0 0 60px rgba(102,126,234,.8); }
    .mel-avatar img { width: 100%; height: 100%; object-fit: cover; }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }

    .transcription-preview {
      font-size: .9rem;
      color: rgba(255,255,255,.72);
      min-height: 20px;
      text-align: center;
    }
    .volume-indicator {
      width: 100%; height: 4px; background: rgba(255,255,255,.2);
      border-radius: 2px; overflow: hidden; display: none;
    }
    .volume-indicator.active { display: block; }
    .volume-level {
      height: 100%; background: linear-gradient(90deg,#667eea 0%,#764ba2 100%);
      width: 0%; transition: width .1s;
    }

    .history-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .history-controls label { width: 100%; font-size: .85rem; color: rgba(255,255,255,.72); }
    .history-controls select { flex: 1; min-width: 0; max-width: 100%; }
    .history-controls button, .history-controls select {
      padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18);
    }

    .chat-results {
      flex: 1;
      overflow-y: auto;
      min-height: 190px;
      padding: 4px;
      scroll-behavior: smooth;
    }
    .message {
      margin-bottom: 12px;
      padding: 13px 15px;
      border-radius: 12px;
      max-width: 84%;
    }
    .message.user { background: rgba(102,126,234,.3); margin-left: auto; }
    .message.ai { background: rgba(255,255,255,.1); margin-right: auto; }
    .message.failed { outline: 1px solid rgba(255,120,120,.7); }
    .message .role { font-size: .8rem; color: rgba(255,255,255,.6); margin-bottom: 5px; }
    .message .content { font-size: 1rem; line-height: 1.5; white-space: pre-wrap; }

    .input-area {
      background: rgba(255,255,255,.1);
      border-radius: 14px;
      padding: 14px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,.1);
    }
    textarea {
      width: 100%;
      min-height: 92px;
      max-height: 260px;
      overflow-y: auto;
      background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 10px;
      padding: 13px;
      color: #fff;
      font-size: 1rem;
      resize: vertical;
      font-family: inherit;
      line-height: 1.45;
    }
    textarea::placeholder { color: rgba(255,255,255,.5); }
    textarea:focus { outline: none; border-color: rgba(102,126,234,.9); }

    .drop-zone {
      border: 2px dashed rgba(255,255,255,.28);
      border-radius: 9px;
      padding: 10px;
      margin-top: 9px;
      text-align: center;
      color: rgba(255,255,255,.64);
      cursor: pointer;
      transition: all .2s;
      font-size: .88rem;
    }
    .drop-zone.dragover { background: rgba(102,126,234,.13); border-color: rgba(102,126,234,.9); color: #fff; }
    .drop-zone input[type="file"] { display: none; }

    .input-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .primary-btn, .secondary-btn, .professor-btn {
      border: none;
      border-radius: 24px;
      padding: 10px 22px;
      color: #fff;
      font-size: .95rem;
      cursor: pointer;
      transition: transform .15s, box-shadow .15s;
    }
    .primary-btn, .professor-btn { background: linear-gradient(135deg,#667eea 0%,#764ba2 100%); }
    .secondary-btn { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.2); }
    .primary-btn:hover:not(:disabled), .secondary-btn:hover:not(:disabled), .professor-btn:hover:not(:disabled) { transform: translateY(-1px); }
    #queueState { margin-left: auto; font-size: .82rem; color: rgba(255,255,255,.7); }
    #chatStatus { min-height: 21px; margin-top: 7px; font-size: .88rem; color: rgba(255,255,255,.82); }

    .professor-link { text-align: center; }
    .professor-btn { background: linear-gradient(135deg,#f093fb 0%,#f5576c 100%); }

    @media (max-width: 600px) {
      body { padding: 10px; }
      .container { min-height: calc(100vh - 20px); max-height: none; gap: 10px; }
      .header h1 { font-size: 1.8rem; }
      .mel-avatar { width: 112px; height: 112px; }
      .message { max-width: 96%; }
      textarea { min-height: 105px; max-height: 40vh; }
      .input-actions button { flex: 1; }
      #queueState { width: 100%; margin-left: 0; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>MELITURGOS</h1></div>

    <div class="mel-avatar-wrapper">
      <div class="mel-avatar" id="melAvatar" role="button" tabindex="0" aria-label="Parler à MEL">
        <img src="/meliturgos-avatar-fille.png" alt="MEL">
      </div>
    </div>

    <div class="transcription-preview" id="transcription">Appuyez sur MEL pour parler</div>
    <div class="volume-indicator" id="volumeIndicator"><div class="volume-level" id="volumeLevel"></div></div>

    <div class="history-controls">
      <label for="conversationSelect">Conversations</label>
      <select id="conversationSelect" aria-label="Historique des conversations"><option value="">Conversation actuelle</option></select>
      <button id="newConversation" type="button">Nouvelle conversation</button>
    </div>

    <div class="chat-results" id="chatResults" role="log" aria-label="Conversation avec MEL"></div>

    <div class="input-area">
      <textarea id="messageInput" placeholder="Écrivez votre message… Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne." aria-label="Message à MEL" maxlength="12000" autofocus></textarea>
      <div class="drop-zone" id="dropZone">
        <span id="dropZoneText">Glissez-déposez des fichiers ici ou cliquez pour parcourir</span>
        <input type="file" id="fileInput" multiple>
      </div>
      <div class="input-actions">
        <button class="primary-btn" id="sendBtn" type="button">Envoyer</button>
        <button class="secondary-btn" id="stopBtn" type="button" disabled>Arrêter la réponse</button>
        <span id="queueState" aria-live="polite">Prêt</span>
      </div>
      <p id="chatStatus" role="status" aria-live="polite"></p>
    </div>

    <div class="professor-link"><button class="professor-btn" id="professorBtn" type="button">Passer en mode complet / Professeur</button></div>
  </div>

  <script>
    function storedId(key) {
      try {
        const value = localStorage.getItem(key) || crypto.randomUUID();
        localStorage.setItem(key, value);
        return value;
      } catch (_) {
        return crypto.randomUUID();
      }
    }

    let conversationId = storedId('mel.conversation');
    const deviceId = storedId('mel.device');

    const melAvatar = document.getElementById('melAvatar');
    const transcription = document.getElementById('transcription');
    const volumeIndicator = document.getElementById('volumeIndicator');
    const volumeLevel = document.getElementById('volumeLevel');
    const messageInput = document.getElementById('messageInput');
    const dropZone = document.getElementById('dropZone');
    const dropZoneText = document.getElementById('dropZoneText');
    const fileInput = document.getElementById('fileInput');
    const professorBtn = document.getElementById('professorBtn');
    const chatResults = document.getElementById('chatResults');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const queueState = document.getElementById('queueState');
    const chatStatus = document.getElementById('chatStatus');
    const conversationSelect = document.getElementById('conversationSelect');
    const newConversation = document.getElementById('newConversation');

    let historyLoading = false;
    let processingQueue = false;
    let activeController = null;
    let activeMessage = null;
    let notice = '';
    const messageQueue = [];
    const queuedIds = new Set();

    function queueBusy() {
      return processingQueue || messageQueue.length > 0 || !!activeMessage;
    }

    function renderState() {
      const waiting = messageQueue.length;
      if (activeMessage) {
        queueState.textContent = waiting > 0 ? 'MEL répond · ' + waiting + ' en attente' : 'MEL répond';
      } else if (waiting > 0) {
        queueState.textContent = waiting + ' message' + (waiting > 1 ? 's' : '') + ' en attente';
      } else {
        queueState.textContent = 'Prêt';
      }

      if (activeMessage) {
        chatStatus.textContent = waiting > 0 ? 'MEL réfléchit… Vous pouvez continuer à écrire. ' + waiting + ' message' + (waiting > 1 ? 's' : '') + ' suivra.' : 'MEL réfléchit… Vous pouvez continuer à écrire.';
      } else {
        chatStatus.textContent = notice;
      }

      stopBtn.disabled = !activeController;
      sendBtn.disabled = historyLoading;
      conversationSelect.disabled = historyLoading || queueBusy();
      newConversation.disabled = historyLoading || queueBusy();
      messageInput.disabled = false;
    }

    function setNotice(text) {
      notice = text || '';
      renderState();
    }

    function addMessage(message, role) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + role;

      const roleHeader = document.createElement('div');
      roleHeader.className = 'role';
      roleHeader.textContent = role === 'user' ? 'Vous' : 'MEL';

      const content = document.createElement('div');
      content.className = 'content';
      content.textContent = message.content || message.prompt || '';

      messageDiv.appendChild(roleHeader);
      messageDiv.appendChild(content);
      chatResults.appendChild(messageDiv);
      chatResults.scrollTop = chatResults.scrollHeight;
      return messageDiv;
    }

    function makeMessageId() {
      return 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    }

    function sendMessage(text, attachments) {
      const list = Array.isArray(attachments) ? attachments : [];
      const normalized = String(text || '').trim();
      if (historyLoading) {
        setNotice('Historique en cours de chargement. Réessayez juste après.');
        return null;
      }
      if (!normalized && list.length === 0) return null;

      const finalText = normalized || ('Fichier' + (list.length > 1 ? 's' : '') + ' joint' + (list.length > 1 ? 's' : '') + ' : ' + list.map(function(a){ return a.name || 'fichier'; }).join(', '));
      if (finalText.length > 12000) {
        setNotice('Message trop long (12 000 caractères maximum).');
        return null;
      }

      const id = makeMessageId();
      if (queuedIds.has(id)) return id;
      queuedIds.add(id);

      const item = {
        id: id,
        text: finalText,
        attachments: list,
        conversationId: conversationId,
        deviceId: deviceId,
        userNode: addMessage({ content: finalText }, 'user')
      };
      messageQueue.push(item);

      if (messageInput.value.trim() === normalized) {
        messageInput.value = '';
        autoGrowInput();
      }

      notice = '';
      renderState();
      void processMessageQueue();
      messageInput.focus();
      return id;
    }

    async function processMessageQueue() {
      if (processingQueue) return;
      processingQueue = true;
      renderState();

      try {
        while (messageQueue.length > 0) {
          const item = messageQueue.shift();
          activeMessage = item;
          const controller = new AbortController();
          activeController = controller;
          renderState();

          let timeoutId = null;
          try {
            timeoutId = setTimeout(function() {
              if (!controller.signal.aborted) controller.abort('timeout');
            }, 65000);

            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: item.text,
                conversation_id: item.conversationId,
                device_id: item.deviceId,
                attachments: item.attachments
              }),
              signal: controller.signal
            });

            const data = await response.json().catch(function(){ return {}; });
            if (!response.ok) {
              throw new Error(response.status === 401 ? 'Authentification requise : rechargez la page.' :
                response.status === 429 ? 'Limite atteinte. Réessayez plus tard.' :
                'MEL est indisponible. Votre message est conservé pour réessayer.');
            }
            if (typeof data.text !== 'string' || !data.text.trim()) {
              throw new Error('Réponse vide. Réessayez.');
            }

            addMessage({ content: data.text }, 'ai');
            item.userNode.classList.remove('failed');
            notice = data.archive_saved === false ? 'Réponse reçue, mais historique non sauvegardé.' : '';
            await refreshConversations();
          } catch (error) {
            const wasAborted = controller.signal.aborted;
            const abortReason = controller.signal.reason;
            item.userNode.classList.add('failed');

            if (wasAborted && abortReason === 'user_stop') {
              notice = 'Réponse arrêtée. Les messages déjà en attente sont conservés.';
            } else if (wasAborted && abortReason === 'timeout') {
              notice = 'Délai dépassé. Vérifiez l’historique avant de renvoyer.';
            } else {
              notice = error && error.message ? error.message : 'Erreur de communication avec MEL.';
            }

            if (!messageInput.value.trim() && !wasAborted) {
              messageInput.value = item.text;
              autoGrowInput();
            }
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
            if (activeController === controller) activeController = null;
            activeMessage = null;
            renderState();
          }
        }
      } finally {
        processingQueue = false;
        activeController = null;
        activeMessage = null;
        renderState();
        messageInput.focus();
      }
    }

    function stopCurrentResponse() {
      if (!activeController || activeController.signal.aborted) return;
      activeController.abort('user_stop');
      renderState();
    }

    function autoGrowInput() {
      messageInput.style.height = 'auto';
      const maxHeight = 260;
      const desired = Math.max(92, Math.min(messageInput.scrollHeight, maxHeight));
      messageInput.style.height = desired + 'px';
    }

    sendBtn.addEventListener('click', function() { sendMessage(messageInput.value); });
    stopBtn.addEventListener('click', stopCurrentResponse);
    messageInput.addEventListener('input', autoGrowInput);
    messageInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendMessage(messageInput.value);
      }
    });

    professorBtn.addEventListener('click', function() { window.location.href = '/professor'; });

    function saveConversation() {
      try { localStorage.setItem('mel.conversation', conversationId); } catch (_) {}
    }

    async function refreshConversations() {
      try {
        const response = await fetch('/api/gen2/conversations');
        if (!response.ok) throw new Error('Historique indisponible.');
        const data = await response.json();
        conversationSelect.replaceChildren();

        const current = document.createElement('option');
        current.value = conversationId;
        current.textContent = 'Conversation actuelle';
        conversationSelect.appendChild(current);

        for (const conversation of data.conversations || []) {
          if (conversation.id === conversationId) {
            current.textContent = conversation.title || 'Conversation';
            continue;
          }
          const option = document.createElement('option');
          option.value = conversation.id;
          option.textContent = conversation.title || 'Conversation';
          conversationSelect.appendChild(option);
        }
        conversationSelect.value = conversationId;
      } catch (_) {
        /* The current conversation remains usable if listing is unavailable. */
      }
    }

    async function loadHistory() {
      if (queueBusy() || historyLoading) return;
      historyLoading = true;
      renderState();
      try {
        const response = await fetch('/api/gen2/conversations/messages?conversation_id=' + encodeURIComponent(conversationId));
        if (!response.ok) throw new Error('Historique indisponible. Rechargez pour réessayer.');
        const data = await response.json();
        chatResults.replaceChildren();
        for (const message of data.messages || []) {
          addMessage(message, message.role === 'user' ? 'user' : 'ai');
        }
      } catch (error) {
        notice = error.message;
      } finally {
        historyLoading = false;
        renderState();
      }
    }

    conversationSelect.addEventListener('change', async function() {
      if (queueBusy()) return;
      conversationId = conversationSelect.value;
      saveConversation();
      await loadHistory();
    });

    newConversation.addEventListener('click', async function() {
      if (queueBusy() || historyLoading) return;
      conversationId = crypto.randomUUID();
      saveConversation();
      chatResults.replaceChildren();
      notice = '';
      await refreshConversations();
      renderState();
      messageInput.focus();
    });

    dropZone.addEventListener('click', function() { fileInput.click(); });
    dropZone.addEventListener('dragover', function(event) {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function(event) {
      event.preventDefault();
      dropZone.classList.remove('dragover');
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length > 0) void handleFiles(files);
    });
    fileInput.addEventListener('change', function(event) {
      const files = Array.from(event.target.files || []);
      if (files.length > 0) void handleFiles(files);
      event.target.value = '';
    });

    async function handleFiles(files) {
      const uploaded = [];
      dropZoneText.textContent = 'Envoi de ' + files.length + ' fichier' + (files.length > 1 ? 's' : '') + '…';

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const response = await fetch('/api/files/upload', { method: 'POST', body: formData });
          if (!response.ok) throw new Error('Échec de l’envoi de ' + file.name);
          const data = await response.json();
          uploaded.push({
            name: file.name,
            type: file.type || '',
            size: file.size || 0,
            url: data.url || data.path || ''
          });
        } catch (error) {
          setNotice(error.message || 'Échec de l’envoi d’un fichier.');
        }
      }

      dropZoneText.textContent = 'Glissez-déposez des fichiers ici ou cliquez pour parcourir';
      if (uploaded.length > 0) sendMessage(messageInput.value, uploaded);
    }

    let recognition = null;
    let isListening = false;

    function initSpeechRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        transcription.textContent = 'Reconnaissance vocale non supportée sur ce navigateur';
        return;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'fr-FR';

      recognition.onstart = function() {
        isListening = true;
        melAvatar.classList.add('active');
        transcription.textContent = 'Écoute…';
        volumeIndicator.classList.add('active');
        volumeLevel.style.width = '70%';
      };

      recognition.onend = function() {
        isListening = false;
        melAvatar.classList.remove('active');
        volumeIndicator.classList.remove('active');
        volumeLevel.style.width = '0%';
      };

      recognition.onresult = function(event) {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptText = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTranscript += transcriptText;
          else interimTranscript += transcriptText;
        }
        transcription.textContent = finalTranscript || interimTranscript || 'Écoute…';
        if (finalTranscript.trim()) {
          sendMessage(finalTranscript);
          transcription.textContent = 'Appuyez sur MEL pour parler';
        }
      };

      recognition.onerror = function(event) {
        transcription.textContent = 'Erreur de reconnaissance vocale : ' + event.error;
        isListening = false;
        melAvatar.classList.remove('active');
        volumeIndicator.classList.remove('active');
      };
    }

    function toggleListening() {
      if (!recognition) initSpeechRecognition();
      if (!recognition) return;
      if (isListening) recognition.stop();
      else recognition.start();
    }

    melAvatar.addEventListener('click', toggleListening);
    melAvatar.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleListening();
      }
    });

    window.addEventListener('focus', function() {
      if (!queueBusy() && !messageInput.value.trim()) {
        void loadHistory();
        void refreshConversations();
      }
    });

    renderState();
    autoGrowInput();
    void loadHistory();
    void refreshConversations();
    initSpeechRecognition();
  </script>
</body>
</html>
  `;

  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
