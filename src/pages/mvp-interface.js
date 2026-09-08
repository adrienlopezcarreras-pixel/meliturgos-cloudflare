/**
 * MELITURGOS MVP INTERFACE - Single Page
 * Simple, clean, production-ready UI
 */

export async function onRequestGet(context) {
  const { env, request } = context;
  
  const body = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MELITURGOS</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

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
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-top: 20px;
    }

    .header h1 {
      font-size: 2.5rem;
      font-weight: 300;
      letter-spacing: 2px;
      color: #e0e0e0;
    }

    /* MEL Avatar */
    .mel-avatar-wrapper {
      display: flex;
      justify-content: center;
      margin: 20px 0;
    }

    .mel-avatar {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border: 4px solid rgba(255, 255, 255, 0.2);
      overflow: hidden;
    }

    .mel-avatar:hover {
      transform: scale(1.05);
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
    }

    .mel-avatar.active {
      animation: pulse 1.5s infinite;
      box-shadow: 0 0 60px rgba(102, 126, 234, 0.8);
    }

    .mel-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.03);
      }
    }

    /* Message Input Area */
    .input-area {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    textarea {
      width: 100%;
      min-height: 100px;
      max-height: 200px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 15px;
      color: #fff;
      font-size: 1rem;
      resize: vertical;
      font-family: inherit;
    }

    textarea::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }

    textarea:focus {
      outline: none;
      border-color: rgba(102, 126, 234, 0.8);
    }

    /* Drop Zone */
    .drop-zone {
      border: 2px dashed rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      padding: 15px;
      margin-top: 10px;
      text-align: center;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      transition: all 0.2s;
    }

    .drop-zone.dragover {
      background: rgba(102, 126, 234, 0.1);
      border-color: rgba(102, 126, 234, 0.8);
      color: #fff;
    }

    .drop-zone input[type="file"] {
      display: none;
    }

    /* Chat Results */
    .chat-results {
      flex: 1;
      overflow-y: auto;
      min-height: 300px;
      margin-bottom: 20px;
    }

    .message {
      margin-bottom: 15px;
      padding: 15px;
      border-radius: 12px;
      max-width: 80%;
    }

    .message.user {
      background: rgba(102, 126, 234, 0.3);
      margin-left: auto;
    }

    .message.ai {
      background: rgba(255, 255, 255, 0.1);
      margin-right: auto;
    }

    .message .role {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 5px;
    }

    .message .content {
      font-size: 1rem;
      line-height: 1.5;
    }

    .message .media {
      margin-top: 10px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }

    .message .media img,
    .message .media video,
    .message .media audio {
      max-width: 100%;
      margin-top: 10px;
      border-radius: 8px;
    }

    /* Professor Button */
    .professor-link {
      text-align: center;
      margin-top: 10px;
    }

    .professor-btn {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      border: none;
      border-radius: 25px;
      padding: 12px 40px;
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .professor-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 20px rgba(240, 147, 251, 0.4);
    }

    /* Transcription Preview */
    .transcription-preview {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.7);
      margin-top: 10px;
      min-height: 20px;
    }

    /* Volume Indicator */
    .volume-indicator {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      margin-top: 10px;
      overflow: hidden;
      display: none;
    }

    .volume-indicator.active {
      display: block;
    }

    .volume-level {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      width: 0%;
      transition: width 0.1s;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .header h1 {
        font-size: 2rem;
      }

      .mel-avatar {
        width: 120px;
        height: 120px;
      }

      .message {
        max-width: 95%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MELITURGOS</h1>
    </div>

    <div class="mel-avatar-wrapper">
      <div class="mel-avatar" id="melAvatar" role="button" tabindex="0" aria-label="Discutez avec MEL">
        <img src="https://meliturgos.adrien-lopezcarreras.workers.dev/mel-avatar-fille.png" alt="MEL">
      </div>
    </div>

    <div class="transcription-preview" id="transcription">Appuyez sur MEL pour parler</div>
    <div class="volume-indicator" id="volumeIndicator">
      <div class="volume-level" id="volumeLevel"></div>
    </div>

    <div class="input-area">
      <textarea id="messageInput" placeholder="Écrivez votre message..." autofocus></textarea>
      
      <div class="drop-zone" id="dropZone">
        <span id="dropZoneText">Glissez-déposez un fichier ici ou cliquez pour parcourir</span>
        <input type="file" id="fileInput" multiple>
      </div>

      <button class="professor-btn" id="professorBtn">Mode Professeur</button>
    </div>

    <div class="chat-results" id="chatResults"></div>
  </div>

  <script>
    // API Base URL
    const API_BASE = '/api';

    // DOM Elements
    const melAvatar = document.getElementById('melAvatar');
    const transcription = document.getElementById('transcription');
    const volumeIndicator = document.getElementById('volumeIndicator');
    const volumeLevel = document.getElementById('volumeLevel');
    const messageInput = document.getElementById('messageInput');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const professorBtn = document.getElementById('professorBtn');
    const chatResults = document.getElementById('chatResults');

    // Speech Recognition
    let recognition = null;
    let isListening = false;

    // Initialize Speech Recognition
    function initSpeechRecognition() {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'fr-FR';

        recognition.onstart = () => {
          isListening = true;
          melAvatar.classList.add('active');
          transcription.textContent = 'Écoute...';
          volumeIndicator.classList.add('active');
        };

        recognition.onend = () => {
          isListening = false;
          melAvatar.classList.remove('active');
        };

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            transcription.textContent = finalTranscript;
          } else if (interimTranscript) {
            transcription.textContent = interimTranscript;
          }

          if (event.results[0].isFinal) {
            sendMessage(transcription.textContent);
            transcription.textContent = 'Appuyez sur MEL pour parler';
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          transcription.textContent = 'Erreur de reconnaissance vocale';
          isListening = false;
          melAvatar.classList.remove('active');
        };
      } else {
        transcription.textContent = 'Reconnaissance vocale non supportée';
      }
    }

    // Start Listening
    melAvatar.addEventListener('click', () => {
      if (!recognition) {
        initSpeechRecognition();
      }
      
      if (recognition) {
        if (isListening) {
          recognition.stop();
        } else {
          recognition.start();
        }
      }
    });

    // Send Message
    async function sendMessage(text, files = []) {
      if (!text.trim()) return;

      const messageData = {
        role: 'user',
        content: text,
        files: files
      };

      // Display user message
      addMessage(messageData, 'user');

      try {
        const response = await fetch('/api/professor/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: text,
            files: files,
            owner: 'meliturgos-user'
          })
        });

        if (!response.ok) {
          throw new Error('Erreur de communication avec le serveur');
        }

        const data = await response.json();

        // Display AI message
        addMessage(data, 'ai');

      } catch (error) {
        console.error('Error sending message:', error);
        addMessage({ role: 'ai', content: 'Désolé, une erreur est survenue. Veuillez réessayer.' }, 'ai');
      }
    }

    // Add Message to Chat
    function addMessage(message, role) {
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;

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
    }

    // Professor Mode
    professorBtn.addEventListener('click', () => {
      window.location.href = '/professor';
    });

    // File Upload
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
      const files = Array.from(event.target.files);
      if (files.length > 0) {
        handleFiles(files);
      }
    });

    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragover');
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        handleFiles(files);
      }
    });

    async function handleFiles(files) {
      const uploadedFiles = [];

      for (const file of files) {
        // Display file name
        const fileNotification = document.createElement('div');
        fileNotification.className = 'message user';
        fileNotification.innerHTML = \`
          <div class="role">Vous</div>
          <div class="content">📎 \${file.name}</div>
        \`;
        chatResults.appendChild(fileNotification);
        chatResults.scrollTop = chatResults.scrollHeight;

        // Upload file
        const formData = new FormData();
        formData.append('file', file);

        try {
          const uploadResponse = await fetch('/api/files/upload', {
            method: 'POST',
            body: formData
          });

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            uploadedFiles.push(uploadData.url);
            console.log('File uploaded:', uploadData.url);
          }
        } catch (error) {
          console.error('Error uploading file:', error);
        }
      }

      // Send message with files
      if (uploadedFiles.length > 0) {
        sendMessage(messageInput.value, uploadedFiles);
        messageInput.value = '';
      }
    }

    // Enter key to send
    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage(messageInput.value);
        messageInput.value = '';
      }
    });

    // Initialize
    initSpeechRecognition();
  </script>
</body>
</html>
  `;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}