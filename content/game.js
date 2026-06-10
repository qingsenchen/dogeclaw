(function () {
  const CONTENT_CONFIG = globalThis.DogeclawConfig?.content || {};
  const SVG_NS = "http://www.w3.org/2000/svg";
  const GAME_BEST_SCORE_KEY = `${CONTENT_CONFIG.gameBestScoreKeyPrefix || "dogeclaw-game-best:"}${location.host}`;
  const GAME_WIDTH = 360;
  const GAME_HEIGHT = 150;
  const GAME_GROUND_Y = 148;
  const GAME_RUNNER_X = 36;
  const GAME_GRAVITY = 1850;
  const GAME_JUMP_VELOCITY = 650;
  const GAME_PANEL_MAX_WIDTH = 236;
  const GAME_BUTTON_ROUND_INSET = 14;

  function readGameBestScore() {
    try {
      const value = Number(localStorage.getItem(GAME_BEST_SCORE_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
      return 0;
    }
  }

  function persistGameBestScore(score) {
    try {
      localStorage.setItem(GAME_BEST_SCORE_KEY, String(Math.max(0, Math.floor(Number(score) || 0))));
    } catch {}
  }

  function createInitialState() {
    return {
      visible: false,
      animationFrame: 0,
      lastFrameAt: 0,
      started: false,
      score: 0,
      bestScore: readGameBestScore(),
      gameOver: false,
      runnerY: 0,
      runnerVelocity: 0,
      runnerDucking: false,
      groundOffset: 0,
      speed: 230,
      spawnIn: 0,
      obstacles: [],
      clouds: []
    };
  }

  function createController(options = {}) {
    const state = options.state;
    const t = typeof options.t === "function" ? options.t : (key) => key;
    const getElements = typeof options.getElements === "function" ? options.getElements : () => ({});
    const floatingButtonCompactWidth = options.floatingButtonCompactWidth || 132;
    const floatingButtonEdgePadding = options.floatingButtonEdgePadding || 8;
    const addManagedEventListener =
      typeof options.addManagedEventListener === "function"
        ? options.addManagedEventListener
        : (target, type, listener, listenerOptions) => target?.addEventListener?.(type, listener, listenerOptions);
    const callbacks = {
      closeConfigPanel: options.closeConfigPanel,
      stopChannelAutoCheck: options.stopChannelAutoCheck,
      updateButtonExpansionSide: options.updateButtonExpansionSide,
      renderHoverMessages: options.renderHoverMessages,
      scheduleSync: options.scheduleSync,
      restoreChatRecordsAfterConfig: options.restoreChatRecordsAfterConfig,
      scheduleTabConversationPersist: options.scheduleTabConversationPersist
    };
    const elements = new Proxy(
      {},
      {
        get(_target, property) {
          return getElements()?.[property];
        }
      }
    );

    function createSvgElement(name, attributes = {}) {
      const node = document.createElementNS(SVG_NS, name);
      Object.entries(attributes).forEach(([key, value]) => {
        node.setAttribute(key, String(value));
      });
      return node;
    }

    function createGameIconButton(svgElement, className, label, pathData) {
      const createSvg = typeof svgElement === "function" ? svgElement : createSvgElement;
      const iconButton = document.createElement("button");
      iconButton.className = className;
      iconButton.type = "button";
      iconButton.title = label;
      iconButton.setAttribute("aria-label", label);
      const iconSvg = createSvg("svg", {
        viewBox: "0 0 24 24",
        "aria-hidden": "true"
      });
      iconSvg.append(
        createSvg("path", {
          d: pathData,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        })
      );
      iconButton.append(iconSvg);
      return iconButton;
    }

    function createElements(svgElement) {
      const gamePanel = document.createElement("div");
      gamePanel.className = "pig-game-panel";
      gamePanel.hidden = true;
      gamePanel.tabIndex = -1;
      gamePanel.setAttribute("role", "group");
      gamePanel.setAttribute("aria-label", t("game.title"));

      const gameHeader = document.createElement("div");
      gameHeader.className = "pig-game-header";

      const gameTitle = document.createElement("span");
      gameTitle.className = "pig-game-title";
      gameTitle.textContent = t("game.title");

      const gameHud = document.createElement("span");
      gameHud.className = "pig-game-hud";

      const gameScore = document.createElement("span");
      gameScore.className = "pig-game-stat";
      const gameScoreLabel = document.createElement("span");
      gameScoreLabel.className = "pig-game-stat-label";
      gameScoreLabel.textContent = t("game.score");
      const gameScoreValue = document.createElement("span");
      gameScoreValue.className = "pig-game-stat-value";
      gameScoreValue.textContent = "00000";
      gameScore.append(gameScoreLabel, gameScoreValue);

      const gameBest = document.createElement("span");
      gameBest.className = "pig-game-stat";
      const gameBestLabel = document.createElement("span");
      gameBestLabel.className = "pig-game-stat-label";
      gameBestLabel.textContent = t("game.best");
      const gameBestValue = document.createElement("span");
      gameBestValue.className = "pig-game-stat-value";
      gameBestValue.textContent = "00000";
      gameBest.append(gameBestLabel, gameBestValue);
      gameHud.append(gameScore, gameBest);

      const gameActions = document.createElement("span");
      gameActions.className = "pig-game-actions";
      const gameRestartButton = createGameIconButton(
        svgElement,
        "pig-game-icon-button",
        t("game.restart"),
        "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
      );
      const gameCloseButton = createGameIconButton(
        svgElement,
        "pig-game-icon-button",
        t("game.close"),
        "M6 6l12 12M18 6L6 18"
      );
      gameActions.append(gameRestartButton, gameCloseButton);
      gameHeader.append(gameTitle, gameHud, gameActions);

      const gameCanvas = document.createElement("canvas");
      gameCanvas.className = "pig-game-canvas";
      gameCanvas.width = GAME_WIDTH;
      gameCanvas.height = GAME_HEIGHT;
      gameCanvas.setAttribute("role", "img");
      gameCanvas.setAttribute("aria-label", t("game.canvasAria"));
      gamePanel.append(gameHeader, gameCanvas);

      return {
        gamePanel,
        gameCanvas,
        gameScoreValue,
        gameBestValue,
        gameRestartButton,
        gameCloseButton
      };
    }

    function bindElementEvents(gameElements = {}) {
      const { gamePanel, gameCanvas, gameRestartButton, gameCloseButton } = gameElements;
      gamePanel?.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      gamePanel?.addEventListener("keydown", handleKeydown);
      gamePanel?.addEventListener("keypress", handleKeypress);
      gamePanel?.addEventListener("keyup", handleKeyup);
      gameCanvas?.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        gamePanel?.focus({ preventScroll: true });
        jumpGameRunner();
      });
      gameRestartButton?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        resetGame();
        startGameLoop();
        gamePanel?.focus({ preventScroll: true });
      });
      gameCloseButton?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeGamePanel();
      });
    }

    function stopGameLoop() {
      if (state?.game?.animationFrame) {
        window.cancelAnimationFrame(state.game.animationFrame);
        state.game.animationFrame = 0;
      }
    }

    function resetGame() {
      const game = state.game;
      game.started = false;
      game.gameOver = false;
      game.score = 0;
      game.runnerY = 0;
      game.runnerVelocity = 0;
      game.runnerDucking = false;
      game.groundOffset = 0;
      game.speed = 230;
      game.spawnIn = 0.7;
      game.obstacles = [];
      game.clouds = [
        { x: 88, y: 28, width: 34 },
        { x: 236, y: 46, width: 48 },
        { x: 334, y: 22, width: 28 }
      ];
      game.lastFrameAt = 0;
      renderGamePanel();
      drawGameFrame();
    }

    function openGamePanel() {
      callbacks.closeConfigPanel?.();
      callbacks.stopChannelAutoCheck?.();
      if (state.chatHideTimer) {
        window.clearTimeout(state.chatHideTimer);
        state.chatHideTimer = 0;
      }
      if (state.chatCollapseTimer) {
        window.clearTimeout(state.chatCollapseTimer);
        state.chatCollapseTimer = 0;
      }

      state.game.visible = true;
      state.chatVisible = false;
      state.chatHoldExpanded = true;
      state.commandMenu.visible = false;
      state.commandMenu.query = "";
      state.commandMenu.activeIndex = 0;
      if (!state.game.started && !state.game.score && !state.game.obstacles.length) {
        resetGame();
      }
      callbacks.updateButtonExpansionSide?.();
      callbacks.renderHoverMessages?.();
      renderGamePanel();
      startGameLoop();
      callbacks.scheduleSync?.();
      elements.buttonHoverInput?.blur?.();
      window.requestAnimationFrame(() => {
        elements.gamePanel?.focus?.({ preventScroll: true });
      });
    }

    function closeGamePanel(closeOptions = {}) {
      if (!state.game.visible) {
        return false;
      }

      state.game.visible = false;
      state.game.runnerDucking = false;
      stopGameLoop();
      renderGamePanel();
      if (closeOptions.restoreChat !== false) {
        callbacks.restoreChatRecordsAfterConfig?.();
      }
      callbacks.renderHoverMessages?.();
      callbacks.scheduleSync?.();
      callbacks.scheduleTabConversationPersist?.();
      return true;
    }

    function startGameLoop() {
      if (!state.game.visible || state.game.animationFrame) {
        return;
      }

      state.game.animationFrame = window.requestAnimationFrame(runGameFrame);
    }

    function runGameFrame(timestamp) {
      state.game.animationFrame = 0;
      if (!state.game.visible) {
        return;
      }

      const previous = state.game.lastFrameAt || timestamp;
      const elapsedMs = Math.min(48, Math.max(0, timestamp - previous));
      state.game.lastFrameAt = timestamp;
      if (state.game.started && !state.game.gameOver) {
        updateGame(elapsedMs / 1000);
      }
      drawGameFrame();
      renderGamePanel({ draw: false });
      startGameLoop();
    }

    function startGameRun() {
      const game = state.game;
      if (game.gameOver) {
        resetGame();
      }
      game.started = true;
      game.lastFrameAt = 0;
      startGameLoop();
    }

    function jumpGameRunner() {
      const game = state.game;
      if (!state.game.visible) {
        return false;
      }
      startGameRun();
      if (isGameRunnerGrounded()) {
        game.runnerVelocity = GAME_JUMP_VELOCITY;
        game.runnerDucking = false;
        return true;
      }
      return false;
    }

    function setGameRunnerDucking(ducking) {
      if (!state.game.visible || state.game.gameOver) {
        return;
      }
      state.game.runnerDucking = Boolean(ducking && state.game.started && isGameRunnerGrounded());
    }

    function isGameRunnerGrounded() {
      return state.game.runnerY <= 0.5;
    }

    function updateGame(dt) {
      const game = state.game;
      game.score += dt * 10;
      game.speed = Math.min(430, 230 + Math.floor(game.score / 12) * 4);
      game.groundOffset = (game.groundOffset + game.speed * dt) % 16;

      if (!isGameRunnerGrounded() || game.runnerVelocity > 0) {
        game.runnerVelocity -= GAME_GRAVITY * dt;
        game.runnerY += game.runnerVelocity * dt;
        if (game.runnerY <= 0 && game.runnerVelocity <= 0) {
          game.runnerY = 0;
          game.runnerVelocity = 0;
        }
      }

      game.spawnIn -= dt;
      if (game.spawnIn <= 0) {
        game.obstacles.push(createGameObstacle());
        const pace = Math.max(0.54, 1.04 - game.score / 1200);
        game.spawnIn = pace + Math.random() * 0.68;
      }

      game.obstacles.forEach((obstacle) => {
        obstacle.x -= game.speed * dt;
      });
      game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -10);

      game.clouds.forEach((cloud) => {
        cloud.x -= (18 + game.speed * 0.025) * dt;
        if (cloud.x + cloud.width < -8) {
          cloud.x = GAME_WIDTH + Math.random() * 60;
          cloud.y = 20 + Math.random() * 34;
          cloud.width = 26 + Math.random() * 28;
        }
      });

      const runnerBounds = getGameRunnerBounds();
      if (game.obstacles.some((obstacle) => rectsOverlap(runnerBounds, getGameObstacleBounds(obstacle)))) {
        endGame();
      }
    }

    function createGameObstacle() {
      const tall = Math.random() > 0.46;
      const width = tall ? 18 + Math.floor(Math.random() * 8) : 24 + Math.floor(Math.random() * 14);
      const height = tall ? 34 + Math.floor(Math.random() * 16) : 18 + Math.floor(Math.random() * 10);
      return {
        x: GAME_WIDTH + 12,
        y: GAME_GROUND_Y - height,
        width,
        height,
        kind: tall ? "cactus" : "rock"
      };
    }

    function getGameRunnerBounds() {
      const ducking = state.game.runnerDucking && isGameRunnerGrounded();
      const width = ducking ? 43 : 45;
      const height = ducking ? 20 : 28;
      const top = GAME_GROUND_Y - state.game.runnerY - height;
      return {
        left: GAME_RUNNER_X + 2,
        right: GAME_RUNNER_X + width - 1,
        top: top + 2,
        bottom: GAME_GROUND_Y - state.game.runnerY - 1
      };
    }

    function getGameObstacleBounds(obstacle) {
      return {
        left: obstacle.x + 2,
        right: obstacle.x + obstacle.width - 2,
        top: obstacle.y + 2,
        bottom: obstacle.y + obstacle.height
      };
    }

    function rectsOverlap(left, right) {
      return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    }

    function endGame() {
      const game = state.game;
      game.gameOver = true;
      game.runnerVelocity = 0;
      game.runnerDucking = false;
      const score = Math.floor(game.score);
      if (score > game.bestScore) {
        game.bestScore = score;
        persistGameBestScore(score);
      }
    }

    function updateGamePanelBounds() {
      if (!elements.gamePanel || !elements.button) {
        return;
      }

      const buttonRect = elements.button.getBoundingClientRect();
      const viewportWidth = Math.max(1, window.innerWidth - floatingButtonEdgePadding * 2);
      const buttonWidth = buttonRect.width || floatingButtonCompactWidth;
      const roundedWidth = Math.max(96, buttonWidth - GAME_BUTTON_ROUND_INSET * 2);
      const panelWidth = Math.min(viewportWidth, GAME_PANEL_MAX_WIDTH, roundedWidth);
      const desiredLeft = buttonRect.left + (buttonWidth - panelWidth) / 2;
      const clampedLeft = Math.min(
        Math.max(floatingButtonEdgePadding, desiredLeft),
        window.innerWidth - panelWidth - floatingButtonEdgePadding
      );
      elements.gamePanel.style.setProperty("--pig-game-left", `${Math.round(clampedLeft - buttonRect.left)}px`);
      elements.gamePanel.style.setProperty("--pig-game-width", `${Math.round(panelWidth)}px`);
    }

    function renderGamePanel(renderOptions = {}) {
      if (!elements.gamePanel) {
        return;
      }

      elements.gamePanel.hidden = !state.game.visible;
      elements.button?.classList.toggle("is-game-open", state.game.visible);
      if (!state.game.visible) {
        return;
      }

      updateGamePanelBounds();
      if (elements.gameScoreValue) {
        elements.gameScoreValue.textContent = String(Math.floor(state.game.score)).padStart(5, "0");
      }
      if (elements.gameBestValue) {
        elements.gameBestValue.textContent = String(Math.floor(state.game.bestScore)).padStart(5, "0");
      }
      elements.gamePanel.classList.toggle("is-game-over", state.game.gameOver);
      if (renderOptions.draw !== false) {
        drawGameFrame();
      }
    }

    function syncGameCanvasResolution(canvas, context) {
      if (!canvas || !context) {
        return 1;
      }

      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || GAME_WIDTH));
      const cssHeight = Math.max(1, Math.round(rect.height || canvas.clientHeight || Math.round(cssWidth * (GAME_HEIGHT / GAME_WIDTH))));
      const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
      const pixelHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));
      if (canvas.width !== pixelWidth) {
        canvas.width = pixelWidth;
      }
      if (canvas.height !== pixelHeight) {
        canvas.height = pixelHeight;
      }
      const scale = Math.min(pixelWidth / GAME_WIDTH, pixelHeight / GAME_HEIGHT);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.imageSmoothingEnabled = false;
      return scale;
    }

    function drawGameFrame() {
      const canvas = elements.gameCanvas;
      const context = canvas?.getContext?.("2d");
      if (!context) {
        return;
      }

      const game = state.game;
      syncGameCanvasResolution(canvas, context);
      context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      drawGameClouds(context, game.clouds);
      drawGameGround(context, game.groundOffset);
      game.obstacles.forEach((obstacle) => drawGameObstacle(context, obstacle));
      drawGameRunner(context, game);
      drawGameHud(context, game);
      if (!game.started || game.gameOver) {
        drawGameOverlay(context, game.gameOver ? t("game.over") : t("game.ready"));
      }
    }

    function drawGameClouds(context, clouds) {
      context.fillStyle = "#cbd5e1";
      clouds.forEach((cloud) => {
        const x = Math.round(cloud.x);
        const y = Math.round(cloud.y);
        const width = Math.round(cloud.width);
        context.fillRect(x, y + 6, width, 3);
        context.fillRect(x + 8, y + 2, Math.max(8, width - 18), 4);
        context.fillRect(x + width - 10, y + 5, 10, 3);
      });
    }

    function drawGameGround(context, offset) {
      context.fillStyle = "#334155";
      context.fillRect(0, GAME_GROUND_Y, GAME_WIDTH, 2);
      context.fillStyle = "#94a3b8";
      for (let x = -Math.floor(offset); x < GAME_WIDTH; x += 16) {
        context.fillRect(x, GAME_GROUND_Y + 8, 7, 2);
        if (x % 32 === 0) {
          context.fillRect(x + 9, GAME_GROUND_Y + 15, 4, 2);
        }
      }
    }

    function drawGameRunner(context, game) {
      const ducking = game.runnerDucking && isGameRunnerGrounded();
      const x = GAME_RUNNER_X;
      const floorY = Math.round(GAME_GROUND_Y - game.runnerY);
      const runFrame = game.started && !game.gameOver ? Math.floor(game.score * 1.5) % 4 : 1;
      const step = runFrame % 2;
      const bodyBob = ducking || !isGameRunnerGrounded() ? 0 : runFrame === 1 || runFrame === 3 ? 2 : 0;
      const bodyY = floorY - (ducking ? 19 : 25) + bodyBob;
      const px = (color, left, top, width, height) => {
        context.fillStyle = color;
        context.fillRect(Math.round(left), Math.round(top), Math.round(width), Math.round(height));
      };
      const drawRunLegs = () => {
        if (runFrame === 0) {
          px("#e88913", x + 12, floorY - 10, 4, 5);
          px("#e88913", x + 7, floorY - 5, 5, 5);
          px("#e88913", x + 27, floorY - 10, 4, 5);
          px("#e88913", x + 32, floorY - 5, 5, 5);
          return;
        }

        if (runFrame === 1) {
          px("#e88913", x + 14, floorY - 8, 4, 8);
          px("#e88913", x + 25, floorY - 8, 4, 8);
          return;
        }

        if (runFrame === 2) {
          px("#e88913", x + 12, floorY - 10, 4, 5);
          px("#e88913", x + 16, floorY - 5, 5, 5);
          px("#e88913", x + 27, floorY - 10, 4, 5);
          px("#e88913", x + 23, floorY - 5, 5, 5);
          return;
        }

        px("#e88913", x + 10, floorY - 8, 4, 8);
        px("#e88913", x + 29, floorY - 8, 4, 8);
      };

      if (ducking) {
        px("#f59e0b", x + 6, bodyY + 5, 26, 12);
        px("#e88913", x + 31, bodyY + 0, 3, 3);
        px("#e88913", x + 39, bodyY + 1, 2, 2);
        px("#fbbf24", x + 29, bodyY + 2, 12, 12);
        px("#fde68a", x + 38, bodyY + 9, 5, 3);
        px("#111827", x + 37, bodyY + 5, 2, 2);
        px("#111827", x + 42, bodyY + 9, 2, 2);
        px("#f59e0b", x + 2, bodyY + 7, 5, 4);
        px("#e88913", x + (step ? 10 : 14), floorY - 6, 4, 6);
        px("#e88913", x + (step ? 28 : 24), floorY - 6, 4, 6);
        return;
      }

      px("#f59e0b", x + 7, bodyY + 8, 25, 14);
      px("#e88913", x + 31, bodyY + 0, 3, 4);
      px("#e88913", x + 39, bodyY + 1, 2, 3);
      px("#fbbf24", x + 29, bodyY + 2, 13, 14);
      px("#fde68a", x + 39, bodyY + 11, 5, 4);
      px("#111827", x + 37, bodyY + 6, 2, 2);
      px("#111827", x + 43, bodyY + 12, 2, 2);
      drawRunLegs();
      px("#f59e0b", x + 2, bodyY + (step ? 10 : 8), 6, 5);
      px("#f59e0b", x + 0, bodyY + (step ? 8 : 6), 4, 4);
    }

    function drawGameObstacle(context, obstacle) {
      const x = Math.round(obstacle.x);
      const y = Math.round(obstacle.y);
      context.fillStyle = obstacle.kind === "cactus" ? "#15803d" : "#64748b";
      if (obstacle.kind === "cactus") {
        const trunkWidth = Math.max(8, Math.floor(obstacle.width / 2));
        context.fillRect(x + Math.floor((obstacle.width - trunkWidth) / 2), y, trunkWidth, obstacle.height);
        context.fillRect(x, y + Math.floor(obstacle.height * 0.42), obstacle.width, 7);
        context.fillStyle = "#86efac";
        context.fillRect(x + Math.floor(obstacle.width / 2), y + 4, 2, obstacle.height - 8);
        return;
      }

      context.fillRect(x, y + Math.floor(obstacle.height * 0.32), obstacle.width, Math.floor(obstacle.height * 0.68));
      context.fillStyle = "#94a3b8";
      context.fillRect(x + 5, y, Math.max(8, obstacle.width - 10), Math.floor(obstacle.height * 0.46));
    }

    function drawGameOverlay(context, label) {
      context.font = "800 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 4;
      context.strokeStyle = "rgba(255, 255, 255, 0.86)";
      context.strokeText(label, GAME_WIDTH / 2, 56);
      context.fillStyle = "#0f172a";
      context.fillText(label, GAME_WIDTH / 2, 56);
    }

    function drawGameHud(context, game) {
      const scoreText = `${t("game.score")} ${String(Math.floor(game.score)).padStart(5, "0")}`;
      const bestText = `${t("game.best")} ${String(Math.floor(game.bestScore)).padStart(5, "0")}`;
      context.font = "800 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "top";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(255, 255, 255, 0.82)";
      context.fillStyle = "#0f172a";
      context.strokeText(scoreText, GAME_WIDTH - 8, 8);
      context.fillText(scoreText, GAME_WIDTH - 8, 8);
      context.strokeText(bestText, GAME_WIDTH - 8, 22);
      context.fillText(bestText, GAME_WIDTH - 8, 22);
    }

    function handleKeydown(event) {
      if (!state.game.visible) {
        return false;
      }

      if (isGameEscapeKey(event)) {
        consumeGameKeyEvent(event);
        closeGamePanel();
        return true;
      }

      if (isGameDuckKey(event)) {
        consumeGameKeyEvent(event);
        setGameRunnerDucking(true);
        return true;
      }

      if (isGameJumpKey(event)) {
        consumeGameKeyEvent(event);
        jumpGameRunner();
        return true;
      }

      return false;
    }

    function handleKeyup(event) {
      if (!state.game.visible) {
        return false;
      }

      if (isGameJumpKey(event)) {
        consumeGameKeyEvent(event);
        return true;
      }

      if (isGameDuckKey(event)) {
        consumeGameKeyEvent(event);
        setGameRunnerDucking(false);
        return true;
      }

      return false;
    }

    function handleKeypress(event) {
      if (!state.game.visible || !isGameJumpKey(event)) {
        return false;
      }

      consumeGameKeyEvent(event);
      jumpGameRunner();
      return true;
    }

    function handleInputBeforeInput(event) {
      if (!state.game.visible) {
        return false;
      }

      const data = String(event?.data || "");
      if (data !== " " && data !== "\u00a0") {
        return false;
      }

      consumeGameKeyEvent(event);
      jumpGameRunner();
      return true;
    }

    function handleInputTextFallback(event) {
      if (!state.game.visible) {
        return false;
      }

      const input = event?.currentTarget;
      const value = String(input?.value || "");
      if (!input || !/[\u0020\u00a0]/.test(value)) {
        return false;
      }

      input.value = value.replace(/[\u0020\u00a0]+/g, "");
      jumpGameRunner();
      return true;
    }

    function isGameJumpKey(event) {
      const key = normalizeGameKey(event?.key);
      const code = normalizeGameKey(event?.code);
      const keyCode = Number(event?.keyCode || event?.which || event?.charCode || 0);
      return key === " " || key === "space" || key === "spacebar" || key === "arrowup" || key === "up" || key === "enter" || code === "space" || code === "arrowup" || code === "enter" || keyCode === 32 || keyCode === 38 || keyCode === 13;
    }

    function isGameDuckKey(event) {
      const key = normalizeGameKey(event?.key);
      const code = normalizeGameKey(event?.code);
      const keyCode = Number(event?.keyCode || event?.which || 0);
      return key === "arrowdown" || key === "down" || code === "arrowdown" || keyCode === 40;
    }

    function isGameEscapeKey(event) {
      const key = normalizeGameKey(event?.key);
      const code = normalizeGameKey(event?.code);
      const keyCode = Number(event?.keyCode || event?.which || 0);
      return key === "escape" || key === "esc" || code === "escape" || keyCode === 27;
    }

    function normalizeGameKey(value) {
      return String(value || "").toLowerCase();
    }

    function consumeGameKeyEvent(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
    }

    function installKeyboardCaptureListeners() {
      const listenerOptions = { capture: true };
      addManagedEventListener(window, "keydown", handleKeydown, listenerOptions);
      addManagedEventListener(window, "keypress", handleKeypress, listenerOptions);
      addManagedEventListener(window, "keyup", handleKeyup, listenerOptions);
      addManagedEventListener(document, "keydown", handleKeydown, listenerOptions);
      addManagedEventListener(document, "keypress", handleKeypress, listenerOptions);
      addManagedEventListener(document, "keyup", handleKeyup, listenerOptions);
    }

    installKeyboardCaptureListeners();

    return {
      bindElementEvents,
      close: closeGamePanel,
      createElements,
      handleInputBeforeInput,
      handleInputTextFallback,
      handleKeydown,
      handleKeypress,
      handleKeyup,
      jump: jumpGameRunner,
      open: openGamePanel,
      renderPanel: renderGamePanel,
      reset: resetGame,
      startLoop: startGameLoop,
      stopLoop: stopGameLoop,
      updatePanelBounds: updateGamePanelBounds
    };
  }

  globalThis.DogeclawGame = {
    createController,
    createInitialState
  };
})();
