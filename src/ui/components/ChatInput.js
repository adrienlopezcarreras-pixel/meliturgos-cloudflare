import React, { useState, useCallback, useRef } from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/*', 'application/pdf', 'text/plain', 'text/markdown'];

export function ChatInput({ onSend, onAddAttachment, value, onChange, placeholder }) {
  const textareaRef = useRef(null);

  const validateFile = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`File ${file.name} exceeds size limit.`);
      return false;
    }
    if (!ALLOWED_MIME_TYPES.some(type => file.type.startsWith(type))) {
      console.warn(`File ${file.name} has unsupported type: ${file.type}`);
      return false;
    }
    return true;
  };

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasText = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Handle Text content
      if (item.kind === 'string' || item.type.startsWith('text/')) {
        const text = item.getData('text/plain');
        if (text) {
          onChange((prev) => prev + text);
          hasText = true;
        }
        continue;
      }

      // Handle File/Blob content
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && validateFile(file)) {
          onAddAttachment(file);
        } else if (file && !validateFile(file)) {
          console.error(`Rejected file: ${file.name}`);
        }
      }
    }
  }, [onChange, onAddAttachment]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend(value);
        onChange('');
      }
    }
  }, [value, onSend, onChange]);

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-container">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          autoResize
        />
        <button className="send-button" onClick={() => onSend(value)} disabled={!value.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}