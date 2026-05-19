(function () {
  const CONTENT_CONFIG = globalThis.DogeclawConfig?.content || {};

  function injectStyles(options = {}) {
    const rootId = options.rootId || CONTENT_CONFIG.rootId || "dogeclaw-root";
    const styleId = options.styleId || CONTENT_CONFIG.styleId || "dogeclaw-style";
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #${rootId} {
        all: initial;
      }

      #${rootId}, #${rootId} * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${rootId} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
      }

      #${rootId}[hidden] {
        display: none !important;
      }

      #${rootId} [hidden] {
        display: none !important;
      }

      .pig-floating-button {
        --pig-compact-width: 132px;
        --pig-expanded-width: min(280px, calc(100vw - 16px));
        --pig-expand-offset: 0px;
        --pig-chat-button-gap: 18px;
        --pig-drop-primary: #93c5fd;
        position: relative;
        left: 0;
        top: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: var(--pig-compact-width);
        min-width: var(--pig-compact-width);
        max-width: var(--pig-expanded-width);
        height: 52px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 10px 14px 10px 12px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24);
        cursor: default;
        user-select: none;
        touch-action: none;
        overflow: visible;
        transition: left 180ms ease, width 180ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease;
      }

      .pig-floating-button.is-thinking {
        animation: dogeclaw-breathe 2.4s ease-in-out infinite;
        will-change: top;
      }

      .pig-floating-button.is-thinking:hover,
      .pig-floating-button.is-thinking:focus-within {
        animation-play-state: paused;
      }

      .pig-floating-button:hover,
      .pig-floating-button:focus-within,
      .pig-floating-button.is-thinking,
      .pig-floating-button.is-chat-holding,
      .pig-floating-button.is-input-image-dragging {
        width: var(--pig-expanded-width);
        box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
      }

      .pig-floating-button.is-expand-left:hover,
      .pig-floating-button.is-expand-left:focus-within,
      .pig-floating-button.is-expand-left.is-thinking,
      .pig-floating-button.is-expand-left.is-chat-holding,
      .pig-floating-button.is-expand-left.is-input-image-dragging {
        left: var(--pig-expand-offset);
      }

      .pig-icon-wrap:active {
        cursor: grabbing;
      }

	      .pig-floating-button.is-dragging {
	        width: var(--pig-compact-width);
	        left: 0;
	        top: 0;
	        animation-play-state: paused;
	        transform: scale(0.98);
	        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.24);
	        transition:
	          left 0ms linear,
	          width 140ms ease,
	          box-shadow 140ms ease,
	          transform 140ms ease,
	          background-color 140ms ease;
	      }

      .pig-floating-button.is-expand-left.is-dragging {
        left: 0;
      }

      .pig-floating-button.is-open {
        background: rgba(16, 16, 16, 0.96);
      }

      .pig-fab-aura {
        position: absolute;
        inset: -8px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 24% 50%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 34%),
          radial-gradient(circle at 76% 50%, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0) 40%);
        opacity: 0;
        transform: scale(0.94);
        transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: none;
      }

      .pig-icon-wrap {
        position: relative;
        display: inline-flex;
        width: 32px;
        height: 32px;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        margin-left: -2px;
        cursor: grab;
        z-index: 8;
      }

      .pig-icon-wrap:focus-visible {
        outline: 2px solid rgba(255, 255, 255, 0.58);
        outline-offset: 4px;
        border-radius: 999px;
      }

      .pig-mascot {
        position: relative;
        display: inline-flex;
        width: 32px;
        height: 32px;
        align-items: center;
        justify-content: center;
        z-index: 1;
      }

      .pig-icon {
        width: 32px;
        height: 32px;
        image-rendering: pixelated;
        overflow: visible;
      }

      .pig-head-group {
        transform-origin: center center;
        transition: transform 180ms ease;
      }

      .pig-ear {
        transform-origin: center bottom;
      }

      .pig-eye {
        transform-origin: center;
      }

      .pig-pupil {
        transition: transform 80ms linear;
        transform-box: fill-box;
        transform-origin: center;
      }

      .pig-brow {
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .pig-nose,
      .pig-mouth,
      .pig-tongue {
        transform-box: fill-box;
        transform-origin: center;
      }

      .pig-blush {
        transform-box: fill-box;
        transform-origin: center;
        opacity: 0;
        transition: opacity 140ms ease;
      }

      .pig-tear {
        transform-box: fill-box;
        transform-origin: top center;
        opacity: 0;
        transition: opacity 140ms ease;
        animation: pig-tear-flow 0.9s linear infinite;
      }

      @keyframes pig-tear-flow {
        0%, 100% {
          transform: translateY(0);
        }

        50% {
          transform: translateY(0.7px);
        }
      }

      .pig-bubble-layer {
        position: absolute;
        left: 0;
        top: -14px;
        width: 22px;
        height: 18px;
        pointer-events: none;
        z-index: 3;
      }

      .pig-pixel-bubble {
        position: absolute;
        left: 0;
        top: 0;
        width: 16px;
        height: 16px;
        opacity: 0;
        transform: translateY(6px) scale(0.7);
        image-rendering: pixelated;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12));
      }

      .pig-chat-messages {
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + var(--pig-chat-button-gap, 18px));
        display: flex;
        flex-direction: column;
        gap: 8px;
	        max-height: var(--pig-chat-max-height, calc(100vh - 96px));
	        overflow-x: hidden;
	        overflow-y: auto;
	        -webkit-overflow-scrolling: touch;
	        scrollbar-width: none;
	        opacity: 0;
	        pointer-events: none;
	        cursor: default;
	        user-select: text;
	        transform: translateY(5px) scale(0.985);
	        transform-origin: bottom center;
	        transition:
	          opacity 180ms ease,
	          transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
	        z-index: 5;
	      }

      .pig-chat-messages.is-below-button {
        top: calc(100% + var(--pig-chat-button-gap, 18px));
        bottom: auto;
        transform-origin: top center;
      }

      .pig-chat-messages::-webkit-scrollbar {
        display: none;
      }

      .pig-chat-messages.is-scrollable {
        cursor: default;
      }

      .pig-chat-messages.is-scrollable .pig-chat-bubble {
        cursor: grab;
        touch-action: none;
      }

      .pig-chat-messages.is-drag-scrolling,
      .pig-chat-messages.is-drag-scrolling .pig-chat-bubble {
        cursor: grabbing;
        user-select: none;
      }

	      .pig-chat-messages.is-visible {
	        opacity: 1;
	        pointer-events: auto;
	        transform: translateY(0) scale(1);
	      }

	      .pig-chat-messages.is-collapsing {
	        opacity: 0;
	        pointer-events: none;
	        transform: translateY(4px) scale(0.985);
	      }

      .pig-chat-messages.is-compact-vertical {
        gap: 6px;
      }

      .pig-chat-row.is-command-menu .pig-tip-message.pig-command-menu {
        box-sizing: border-box;
        display: grid;
        gap: 4px;
        width: fit-content;
        min-width: min(220px, calc(100vw - 48px));
        max-width: min(280px, calc(100vw - 48px));
        padding: 5px;
        border-radius: 16px;
      }

      .pig-command-item {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 28px;
        border-radius: 12px;
        padding: 3px 6px;
        color: #ffffff;
        cursor: pointer;
      }

      .pig-command-item:hover,
      .pig-command-item:focus-visible,
      .pig-command-item.is-active {
        background: rgba(255, 255, 255, 0.08);
      }

      .pig-command-name {
        flex: 0 0 auto;
        min-width: 52px;
        min-height: 24px;
        border: 1px solid rgba(147, 197, 253, 0.36);
        border-radius: 8px;
        padding: 3px 8px;
        color: #dbeafe;
        background: rgba(96, 165, 250, 0.22);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        text-align: center;
        white-space: nowrap;
      }

      .pig-command-description {
        flex: 1 1 auto;
        min-width: 0;
        max-width: min(170px, calc(100vw - 138px));
        color: rgba(255, 255, 255, 0.88);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .pig-chat-row {
        display: flex;
        flex: 0 0 auto;
        width: 100%;
      }

      .pig-chat-row.is-left {
        justify-content: flex-start;
      }

      .pig-chat-row.is-right {
        justify-content: flex-end;
      }

      .pig-chat-bubble {
        display: inline-block;
        max-width: min(220px, calc(100vw - 48px));
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.35;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      .pig-chat-bubble:has(.pig-chat-image) {
        max-width: min(240px, calc(100vw - 48px));
        padding: 6px;
      }

      .pig-chat-bubble:has(.pig-markdown-table-wrap) {
        max-width: min(360px, calc(100vw - 48px));
      }

      .pig-chat-bubble,
      .pig-chat-bubble p,
      .pig-chat-bubble li,
      .pig-chat-bubble strong,
      .pig-chat-bubble em,
      .pig-chat-bubble del {
        color: #ffffff;
      }

      .pig-chat-bubble p,
      .pig-chat-bubble ul,
      .pig-chat-bubble ol,
      .pig-chat-bubble blockquote,
      .pig-chat-bubble hr,
      .pig-chat-bubble .pig-markdown-table-wrap,
      .pig-chat-bubble pre {
        margin: 0;
      }

      .pig-chat-bubble p + p,
      .pig-chat-bubble p + ul,
      .pig-chat-bubble p + ol,
      .pig-chat-bubble p + hr,
      .pig-chat-bubble hr + p,
      .pig-chat-bubble ul + hr,
      .pig-chat-bubble ol + hr,
      .pig-chat-bubble hr + ul,
      .pig-chat-bubble hr + ol,
      .pig-chat-bubble ul + p,
      .pig-chat-bubble ol + p,
      .pig-chat-bubble p + .pig-markdown-table-wrap,
      .pig-chat-bubble .pig-markdown-table-wrap + p,
      .pig-chat-bubble ul + .pig-markdown-table-wrap,
      .pig-chat-bubble ol + .pig-markdown-table-wrap,
      .pig-chat-bubble .pig-markdown-table-wrap + ul,
      .pig-chat-bubble .pig-markdown-table-wrap + ol,
      .pig-chat-bubble pre + p,
      .pig-chat-bubble p + pre {
        margin-top: 6px;
      }

      .pig-chat-bubble ul,
      .pig-chat-bubble ol {
        padding-left: 18px;
      }

      .pig-chat-bubble li + li {
        margin-top: 3px;
      }

      .pig-chat-bubble code {
        padding: 1px 4px;
        border-radius: 4px;
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.12);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
      }

      .pig-chat-bubble pre {
        max-width: 100%;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        overflow-x: auto;
        white-space: pre;
      }

      .pig-chat-bubble pre code {
        padding: 0;
        background: transparent;
      }

      .pig-chat-bubble blockquote {
        padding-left: 8px;
        border-left: 2px solid rgba(255, 255, 255, 0.28);
        color: rgba(255, 255, 255, 0.82);
      }

      .pig-markdown-table-wrap {
        max-width: 100%;
        overflow-x: auto;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
      }

      .pig-markdown-table-wrap table {
        width: 100%;
        min-width: 100%;
        border-collapse: collapse;
        color: #ffffff;
        font-size: 12px;
        line-height: 1.35;
      }

      .pig-markdown-table-wrap th,
      .pig-markdown-table-wrap td {
        padding: 6px 8px;
        border-right: 1px solid rgba(255, 255, 255, 0.12);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
      }

      .pig-markdown-table-wrap th {
        background: rgba(255, 255, 255, 0.1);
        font-weight: 700;
      }

      .pig-markdown-table-wrap tr:last-child td {
        border-bottom: 0;
      }

      .pig-markdown-table-wrap th:last-child,
      .pig-markdown-table-wrap td:last-child {
        border-right: 0;
      }

      .pig-markdown-table-wrap .is-align-center {
        text-align: center;
      }

      .pig-markdown-table-wrap .is-align-right {
        text-align: right;
      }

      .pig-chat-bubble hr {
        width: 100%;
        border: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.22);
      }

      .pig-chat-bubble a {
        color: #93c5fd;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .pig-chat-bubble .pig-chat-image {
        display: block;
        width: auto;
        max-width: min(180px, calc(100vw - 72px));
        max-height: min(160px, 32vh);
        object-fit: contain;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.08);
      }

      .pig-chat-bubble .pig-chat-image + .pig-chat-image,
      .pig-chat-bubble .pig-chat-image + p {
        margin-top: 6px;
      }

      .pig-chat-row.is-left .pig-chat-bubble {
        border-color: rgba(255, 255, 255, 0.1);
        border-bottom-left-radius: 5px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
      }

      .pig-chat-row.is-right .pig-chat-bubble {
        border-bottom-right-radius: 5px;
        background: rgba(24, 24, 24, 0.96);
      }

      .pig-chat-row.is-pending .pig-chat-bubble {
        opacity: 0.72;
      }

      .pig-chat-row.is-tip {
        justify-content: center;
      }

      .pig-chat-row.is-tip .pig-tip-message {
        position: relative;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: fit-content;
        max-width: min(280px, calc(100vw - 48px));
        padding: 5px 34px 5px 7px;
        border-color: rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        color: #ffffff;
        background: rgba(24, 24, 24, 0.94);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24);
      }

      .pig-tip-logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
        border-radius: 8px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
        font-size: 12px;
        font-weight: 800;
        overflow: hidden;
      }

      .pig-tip-logo img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .pig-tip-body {
        flex: 0 1 auto;
        min-width: 0;
        max-width: min(210px, calc(100vw - 116px));
        color: rgba(255, 255, 255, 0.88);
        font-size: 12px;
        line-height: 1.25;
      }

      .pig-tip-body p,
      .pig-tip-body ul,
      .pig-tip-body ol {
        margin: 0;
      }

      .pig-tip-action,
      .pig-tip-close {
        all: unset;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .pig-tip-action {
        flex: 0 0 auto;
        min-height: 24px;
        border: 1px solid rgba(96, 165, 250, 0.5);
        border-radius: 8px;
        padding: 3px 8px;
        color: #ffffff;
        background: rgba(37, 99, 235, 0.76);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
      }

      .pig-tip-action[hidden] {
        display: none;
      }

      .pig-tip-close {
        position: absolute;
        top: 50%;
        right: 6px;
        width: 22px;
        height: 22px;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.74);
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-50%);
      }

      .pig-tip-close:hover,
      .pig-tip-close:focus-visible {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
      }

      .pig-tip-close svg {
        width: 13px;
        height: 13px;
        display: block;
      }

      .pig-chat-row.is-component {
        justify-content: flex-start;
      }

      .pig-component-card {
        width: min(260px, calc(100vw - 48px));
      }

      .pig-llm-config-form {
        display: grid;
        gap: 8px;
      }

      .pig-channel-config-form {
        display: grid;
        gap: 8px;
      }

      .pig-channel-config-body {
        display: grid;
        gap: 8px;
      }

      .pig-channel-status,
      .pig-channel-hint {
        color: rgba(255, 255, 255, 0.82);
        font-size: 12px;
        line-height: 1.35;
      }

      .pig-channel-qr {
        display: flex;
        justify-content: center;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
      }

      .pig-channel-qr img {
        width: 168px;
        height: 168px;
        object-fit: contain;
        display: block;
      }

      .pig-chat-messages.is-compact-vertical .pig-channel-config-form,
      .pig-chat-messages.is-compact-vertical .pig-channel-config-body {
        gap: 6px;
      }

      .pig-chat-messages.is-compact-vertical .pig-channel-qr {
        padding: 6px;
      }

      .pig-chat-messages.is-compact-vertical .pig-channel-qr img {
        width: 128px;
        height: 128px;
      }

      .pig-channel-qr-fallback {
        max-width: 168px;
        color: #111827;
        font-size: 12px;
        line-height: 1.35;
        text-align: center;
      }

      .pig-config-title {
        color: #ffffff;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.3;
      }

      .pig-config-field {
        display: grid;
        gap: 4px;
      }

      .pig-config-label {
        color: rgba(255, 255, 255, 0.68);
        font-size: 11px;
        font-weight: 600;
      }

      .pig-config-input {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 0 9px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
        font-size: 12px;
        line-height: 30px;
        outline: 0 !important;
        -webkit-appearance: none;
        appearance: none;
      }

      .pig-config-input:focus {
        border-color: rgba(96, 165, 250, 0.72);
        outline: 0 !important;
        box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.18) !important;
      }

      .pig-config-input::placeholder {
        color: rgba(255, 255, 255, 0.38);
      }

      .pig-config-error {
        color: #fca5a5;
        font-size: 12px;
        line-height: 1.35;
      }

      .pig-config-actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 6px;
      }

      .pig-config-button {
        min-width: 0;
        min-height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 6px 10px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        overflow-wrap: anywhere;
        white-space: normal;
        cursor: pointer;
      }

      .pig-channel-config-form .pig-config-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        justify-content: stretch;
      }

      .pig-channel-config-form .pig-config-button {
        width: 100%;
        padding-left: 6px;
        padding-right: 6px;
      }

      .pig-channel-config-form .pig-config-button:first-child {
        grid-column: 1 / -1;
      }

      .pig-config-button.is-primary {
        border-color: rgba(96, 165, 250, 0.52);
        background: rgba(37, 99, 235, 0.72);
      }

      .pig-config-button:disabled {
        cursor: default;
        opacity: 0.62;
      }

      .pig-button-copy {
        display: inline-flex;
        align-items: center;
        flex: 1 1 auto;
        min-width: 0;
        max-width: 100%;
        padding-right: 26px;
        overflow: visible;
      }

      .pig-button-status {
        position: absolute;
        right: 14px;
        top: 50%;
        z-index: 9;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        min-width: 18px;
        max-width: 18px;
        height: 18px;
        padding: 0;
        overflow: visible;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        transform: translateY(-50%);
        pointer-events: none;
        white-space: nowrap;
      }

      .pig-floating-button.is-thinking.is-stoppable .pig-button-status {
        pointer-events: auto;
        cursor: pointer;
      }

      .pig-floating-button.has-context-usage:not(.is-thinking) .pig-button-status {
        pointer-events: auto;
        cursor: help;
      }

      #${rootId} .pig-input-image-file {
        display: none !important;
      }

      #${rootId} .pig-hover-input-shell {
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        flex: 0 0 auto !important;
        width: 0 !important;
        min-width: 0 !important;
        max-width: none !important;
        height: 30px !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 999px !important;
        padding: 0 !important;
        background: rgba(24, 24, 24, 0.94) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
        opacity: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
        transition: width 180ms ease, padding 180ms ease, opacity 120ms ease !important;
      }

      #${rootId} .pig-hover-input-shell:focus-within {
        outline: 0 !important;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.08),
          0 0 0 2px rgba(96, 165, 250, 0.16) !important;
      }

      #${rootId} .pig-floating-button.is-input-image-dragging .pig-hover-input-shell {
        border-color: rgba(147, 197, 253, 0.5) !important;
        box-shadow:
          inset 0 0 0 1px rgba(147, 197, 253, 0.32),
          0 0 0 2px rgba(147, 197, 253, 0.14) !important;
      }

      #${rootId} .pig-floating-button.is-input-image-drop-target .pig-hover-input-shell {
        border-color: var(--pig-drop-primary) !important;
        box-shadow:
          inset 0 0 0 1px rgba(147, 197, 253, 0.68),
          0 0 0 2px rgba(147, 197, 253, 0.28),
          0 0 16px rgba(147, 197, 253, 0.18) !important;
      }

      #${rootId} .pig-input-image-button,
      #${rootId} .pig-input-image-remove {
        all: unset !important;
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        color: rgba(255, 255, 255, 0.82) !important;
        cursor: pointer !important;
        -webkit-appearance: none !important;
        appearance: none !important;
      }

      #${rootId} .pig-input-image-button {
        width: 0 !important;
        height: 24px !important;
        border: 0 !important;
        border-radius: 999px !important;
        background: transparent !important;
        opacity: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
        transition: width 180ms ease, opacity 120ms ease, background-color 140ms ease, color 140ms ease !important;
      }

      #${rootId} .pig-input-image-button:hover,
      #${rootId} .pig-input-image-button:focus-visible,
      #${rootId} .pig-input-image-remove:hover,
      #${rootId} .pig-input-image-remove:focus-visible {
        color: #ffffff !important;
        background: rgba(255, 255, 255, 0.14) !important;
      }

      #${rootId} .pig-input-image-button svg,
      #${rootId} .pig-input-image-remove svg {
        display: block !important;
        width: 16px !important;
        height: 16px !important;
      }

      #${rootId} .pig-input-image-chip {
        display: none !important;
        align-items: center !important;
        flex: 0 0 auto !important;
        width: 52px !important;
        height: 24px !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-radius: 999px !important;
        padding: 1px 2px 1px 7px !important;
        background: rgba(255, 255, 255, 0.1) !important;
        overflow: hidden !important;
      }

      #${rootId} .pig-input-image-preview {
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        width: 18px !important;
        height: 20px !important;
        border-radius: 999px !important;
        color: #ffffff !important;
        background: transparent !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        line-height: 20px !important;
        text-align: center !important;
      }

      #${rootId} .pig-input-image-remove {
        width: 20px !important;
        height: 20px !important;
        border-radius: 999px !important;
        background: transparent !important;
      }

      #${rootId} input.pig-hover-input {
        all: unset !important;
        box-sizing: border-box !important;
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: 28px !important;
        min-height: 28px !important;
        flex: 1 1 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        padding: 0 !important;
        color: #ffffff !important;
        background: transparent !important;
        box-shadow: none !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        line-height: 28px !important;
        letter-spacing: 0 !important;
        opacity: 1 !important;
        outline: 0 !important;
        pointer-events: auto !important;
        cursor: text !important;
        user-select: text !important;
        -webkit-appearance: none !important;
        appearance: none !important;
      }

      #${rootId} input.pig-hover-input:focus {
        outline: 0 !important;
        box-shadow: none !important;
      }

      #${rootId} input.pig-hover-input::placeholder {
        color: rgba(255, 255, 255, 0.62) !important;
        opacity: 1 !important;
      }

      #${rootId} .pig-floating-button:hover .pig-hover-input-shell,
      #${rootId} .pig-floating-button:focus-within .pig-hover-input-shell,
      #${rootId} .pig-floating-button.is-chat-holding .pig-hover-input-shell,
      #${rootId} .pig-floating-button.is-input-image-dragging .pig-hover-input-shell {
        width: 100% !important;
        flex: 1 1 auto !important;
        padding: 0 10px !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      #${rootId} .pig-floating-button.supports-input-image:hover .pig-hover-input-shell,
      #${rootId} .pig-floating-button.supports-input-image:focus-within .pig-hover-input-shell,
      #${rootId} .pig-floating-button.supports-input-image.is-chat-holding .pig-hover-input-shell,
      #${rootId} .pig-floating-button.supports-input-image.is-input-image-dragging .pig-hover-input-shell {
        width: 100% !important;
        padding: 0 8px !important;
      }

      #${rootId} .pig-floating-button.supports-input-image:hover .pig-input-image-button,
      #${rootId} .pig-floating-button.supports-input-image:focus-within .pig-input-image-button,
      #${rootId} .pig-floating-button.supports-input-image.is-chat-holding .pig-input-image-button,
      #${rootId} .pig-floating-button.supports-input-image.is-input-image-dragging .pig-input-image-button {
        width: 24px !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      #${rootId} .pig-floating-button.supports-input-image.has-input-image:hover .pig-hover-input-shell,
      #${rootId} .pig-floating-button.supports-input-image.has-input-image:focus-within .pig-hover-input-shell,
      #${rootId} .pig-floating-button.supports-input-image.has-input-image.is-chat-holding .pig-hover-input-shell {
        width: 100% !important;
      }

      #${rootId} .pig-floating-button.supports-input-image.has-input-image:hover .pig-input-image-chip,
      #${rootId} .pig-floating-button.supports-input-image.has-input-image:focus-within .pig-input-image-chip,
      #${rootId} .pig-floating-button.supports-input-image.has-input-image.is-chat-holding .pig-input-image-chip {
        display: inline-flex !important;
      }

      #${rootId} .pig-floating-button.is-thinking .pig-hover-input-shell {
        width: 0 !important;
        padding: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      #${rootId} .pig-floating-button.is-dragging .pig-hover-input-shell {
        width: 0 !important;
        padding: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      #${rootId} .pig-floating-button.is-thinking .pig-input-image-button,
      #${rootId} .pig-floating-button.is-thinking .pig-input-image-chip,
      #${rootId} .pig-floating-button.is-dragging .pig-input-image-button,
      #${rootId} .pig-floating-button.is-dragging .pig-input-image-chip {
        display: none !important;
        width: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      .pig-status-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        display: block;
        border-radius: 999px;
        background: #94a3b8;
        box-shadow: 0 0 10px rgba(148, 163, 184, 0.38);
        transition: width 120ms ease, height 120ms ease, border-radius 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
      }

      .pig-floating-button.has-context-usage:not(.is-thinking) .pig-status-dot {
        background:
          conic-gradient(
            rgba(255, 255, 255, 0.96) 0 var(--pig-context-ratio, 0%),
            #94a3b8 var(--pig-context-ratio, 0%) 100%
          );
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.16),
          0 0 10px rgba(148, 163, 184, 0.42);
      }

      .pig-floating-button.is-thinking .pig-status-dot {
        background: #60a5fa;
        box-shadow: 0 0 12px rgba(96, 165, 250, 0.55);
        animation: pig-pulse 1.4s infinite;
      }

      .pig-floating-button.is-thinking.is-stoppable .pig-button-status:hover .pig-status-dot,
      .pig-floating-button.is-thinking.is-stoppable .pig-button-status:focus-visible .pig-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        background: #f87171;
        box-shadow: 0 0 12px rgba(248, 113, 113, 0.58);
        animation: none;
      }

      .pig-tail-tip {
        position: absolute;
        right: -4px;
        top: 50%;
        width: 8px;
        height: 8px;
        border: 2px solid rgba(255, 255, 255, 0.14);
        border-left: none;
        border-bottom: none;
        border-radius: 0 6px 0 0;
        transform: translateY(-50%) rotate(30deg);
        opacity: 0.78;
      }

      @keyframes dogeclaw-breathe {
        0%, 100% {
          top: 0;
        }

        50% {
          top: -8px;
        }
      }

      @keyframes pig-pulse {
        0% {
          transform: scale(1);
          opacity: 1;
        }

        50% {
          transform: scale(1.45);
          opacity: 0.58;
        }

        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .blink {
        animation: pig-blink 0.18s ease;
      }

      @keyframes pig-blink {
        0%, 100% {
          transform: scaleY(1);
        }

        50% {
          transform: scaleY(0.08);
        }
      }

      .double-blink {
        animation: pig-double-blink 0.42s ease;
      }

      @keyframes pig-double-blink {
        0%, 100% {
          transform: scaleY(1);
        }

        20% {
          transform: scaleY(0.08);
        }

        40% {
          transform: scaleY(1);
        }

        65% {
          transform: scaleY(0.08);
        }

        85% {
          transform: scaleY(1);
        }
      }

      .sniff {
        animation: pig-sniff 0.55s ease-in-out 2;
      }

      @keyframes pig-sniff {
        0%, 100% {
          transform: scale(1);
        }

        50% {
          transform: scale(1.28);
        }
      }

      .smile {
        animation: pig-smile 0.55s ease;
      }

      @keyframes pig-smile {
        0%, 100% {
          transform: scaleX(1);
        }

        50% {
          transform: scaleX(1.35) translateY(0.2px);
        }
      }

      .open-mouth {
        animation: pig-open-mouth 0.62s ease;
      }

      @keyframes pig-open-mouth {
        0%, 100% {
          transform: scaleY(1);
        }

        50% {
          transform: scaleY(1.9);
        }
      }

      .pout {
        animation: pig-pout 0.45s ease;
      }

      @keyframes pig-pout {
        0%, 100% {
          transform: scale(1);
        }

        50% {
          transform: scale(0.72);
        }
      }

      .tongue {
        animation: pig-tongue 0.82s ease-out;
      }

      @keyframes pig-tongue {
        0% {
          transform: translateY(-1px) scaleY(0.7);
          opacity: 0;
        }

        35% {
          transform: translateY(1px) scaleY(1);
          opacity: 1;
        }

        100% {
          transform: translateY(0) scaleY(0.9);
          opacity: 0;
        }
      }

      .show-blush {
        animation: pig-show-blush 0.95s ease;
      }

      @keyframes pig-show-blush {
        0% {
          opacity: 0;
        }

        30%, 70% {
          opacity: 0.95;
        }

        100% {
          opacity: 0;
        }
      }

      .wag {
        animation: pig-wag 0.38s ease-in-out 4;
        transform-origin: left center;
      }

      @keyframes pig-wag {
        0%, 100% {
          transform: translateY(-50%) rotate(30deg);
        }

        50% {
          transform: translateY(-50%) rotate(58deg);
        }
      }

      .ear-flap-left {
        animation: pig-ear-left 0.46s ease;
      }

      .ear-flap-right {
        animation: pig-ear-right 0.46s ease;
      }

      @keyframes pig-ear-left {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(-10deg);
        }
      }

      @keyframes pig-ear-right {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(10deg);
        }
      }

      .ear-drop-left {
        animation: pig-ear-drop-left 0.65s ease;
      }

      .ear-drop-right {
        animation: pig-ear-drop-right 0.65s ease;
      }

      @keyframes pig-ear-drop-left {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(12deg);
        }
      }

      @keyframes pig-ear-drop-right {
        0%, 100% {
          transform: rotate(0deg);
        }

        50% {
          transform: rotate(-12deg);
        }
      }

      .tilt-left {
        animation: pig-tilt-left 0.52s ease;
      }

      .tilt-right {
        animation: pig-tilt-right 0.52s ease;
      }

      @keyframes pig-tilt-left {
        0%, 100% {
          transform: rotate(0deg) translateX(0);
        }

        50% {
          transform: rotate(-8deg) translateX(-0.5px);
        }
      }

      @keyframes pig-tilt-right {
        0%, 100% {
          transform: rotate(0deg) translateX(0);
        }

        50% {
          transform: rotate(8deg) translateX(0.5px);
        }
      }

      .nuzzle {
        animation: pig-nuzzle 0.55s ease;
      }

      @keyframes pig-nuzzle {
        0%, 100% {
          transform: translateX(0);
        }

        30% {
          transform: translateX(-2px);
        }

        65% {
          transform: translateX(1px);
        }
      }

      .shake {
        animation: pig-shake 0.42s ease;
      }

      @keyframes pig-shake {
        0%, 100% {
          transform: translateX(0);
        }

        20% {
          transform: translateX(-1.5px);
        }

        40% {
          transform: translateX(1.5px);
        }

        60% {
          transform: translateX(-1px);
        }

        80% {
          transform: translateX(1px);
        }
      }

      .look-left .pig-pupil {
        transform: translate(-1.6px, 0) !important;
      }

      .look-right .pig-pupil {
        transform: translate(1.6px, 0) !important;
      }

      .bubble-pop {
        animation: pig-bubble-pop 1s ease forwards;
      }

      @keyframes pig-bubble-pop {
        0% {
          opacity: 0;
          transform: translateY(8px) scale(0.6);
        }

        20% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        75% {
          opacity: 1;
          transform: translateY(-8px) scale(1);
        }

        100% {
          opacity: 0;
          transform: translateY(-16px) scale(1.08);
        }
      }

    `;

    (document.head || document.documentElement).append(style);
  }



  globalThis.DogeclawContentStyles = {
    injectStyles
  };
})();
