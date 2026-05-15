(function () {
  const t = (key, params) => (globalThis.OnecaiI18n?.t ? globalThis.OnecaiI18n.t(key, params) : key);
  const PET_MOODS = {
    IDLE: "idle",
    HAPPY: "happy",
    CURIOUS: "curious",
    NEEDY: "needy",
    SLEEPY: "sleepy",
    SHY: "shy",
    EXCITED: "excited",
    SAD: "sad",
    SURPRISED: "surprised",
    ANGRY: "angry"
  };
  const PET_ACTIONS = {
    IDLE: "idle",
    BLINK: "blink",
    DOUBLE_BLINK: "double_blink",
    SNIFF: "sniff",
    SMILE: "smile",
    OPEN_MOUTH: "open_mouth",
    POUT: "pout",
    TONGUE: "tongue",
    WAG: "wag",
    CUDDLE: "cuddle",
    YAWN: "yawn",
    LOOK_LEFT: "look_left",
    LOOK_RIGHT: "look_right",
    TILT_LEFT: "tilt_left",
    TILT_RIGHT: "tilt_right",
    EAR_DROP: "ear_drop",
    EAR_PERK: "ear_perk",
    NUZZLE: "nuzzle",
    SHAKE: "shake",
    GREET_COMBO: "greet_combo"
  };
  const PET_FACES = {
    NORMAL: "normal",
    HAPPY: "happy",
    SLEEPY: "sleepy",
    SHY: "shy",
    EXCITED: "excited",
    SAD: "sad",
    SURPRISED: "surprised",
    ANGRY: "angry"
  };
  const PET_FACE_PRESETS = {
    normal: {
      eyeScaleY: 1,
      browLeft: "translate(0,0)",
      browRight: "translate(0,0)",
      blush: 0,
      mouth: "M10 13 Q12 15 14 13"
    },
    happy: {
      eyeScaleY: 0.78,
      browLeft: "translate(0,.2px)",
      browRight: "translate(0,.2px)",
      blush: 0.9,
      mouth: "M10 13 Q12 15.5 14 13"
    },
    sleepy: {
      eyeScaleY: 0.45,
      browLeft: "translate(0,.4px)",
      browRight: "translate(0,.4px)",
      blush: 0,
      mouth: "M10 13 Q12 14.5 14 13"
    },
    shy: {
      eyeScaleY: 0.72,
      browLeft: "translate(.2px,.2px)",
      browRight: "translate(-.2px,.2px)",
      blush: 1,
      mouth: "M10 13 Q12 14.8 14 13"
    },
    excited: {
      eyeScaleY: 1.08,
      browLeft: "translate(0,-.2px)",
      browRight: "translate(0,-.2px)",
      blush: 0.7,
      mouth: "M10 13 Q12 16 14 13"
    },
    sad: {
      eyeScaleY: 0.68,
      browLeft: "translate(.2px,.4px)",
      browRight: "translate(-.2px,.4px)",
      blush: 0,
      mouth: "M10 13 Q12 14.1 14 13"
    },
    surprised: {
      eyeScaleY: 1.2,
      browLeft: "translate(0,-.5px)",
      browRight: "translate(0,-.5px)",
      blush: 0.3,
      mouth: "M11 13 Q12 16 13 13"
    },
    angry: {
      eyeScaleY: 0.88,
      browLeft: "translate(.5px,-.2px)",
      browRight: "translate(-.5px,-.2px)",
      blush: 0,
      mouth: "M10 13 Q12 14.2 14 13"
    }
  };

  function createPetController({ elements, state, scheduleSync }) {
    const moodFaceMap = {
      [PET_MOODS.IDLE]: PET_FACES.NORMAL,
      [PET_MOODS.HAPPY]: PET_FACES.HAPPY,
      [PET_MOODS.CURIOUS]: PET_FACES.NORMAL,
      [PET_MOODS.NEEDY]: PET_FACES.SHY,
      [PET_MOODS.SLEEPY]: PET_FACES.SLEEPY,
      [PET_MOODS.SHY]: PET_FACES.SHY,
      [PET_MOODS.EXCITED]: PET_FACES.EXCITED,
      [PET_MOODS.SAD]: PET_FACES.SAD,
      [PET_MOODS.SURPRISED]: PET_FACES.SURPRISED,
      [PET_MOODS.ANGRY]: PET_FACES.ANGRY
    };
    const labelMap = {
      [PET_MOODS.IDLE]: [t("pet.idle.0"), t("pet.idle.1"), t("pet.idle.2")],
      [PET_MOODS.HAPPY]: [t("pet.happy.0"), t("pet.happy.1"), t("pet.happy.2")],
      [PET_MOODS.CURIOUS]: [t("pet.curious.0"), t("pet.curious.1"), t("pet.curious.2")],
      [PET_MOODS.NEEDY]: [t("pet.needy.0"), t("pet.needy.1"), t("pet.needy.2")],
      [PET_MOODS.SLEEPY]: [t("pet.sleepy.0"), t("pet.sleepy.1"), t("pet.sleepy.2")],
      [PET_MOODS.SHY]: [t("pet.shy.0"), t("pet.shy.1"), t("pet.shy.2")],
      [PET_MOODS.EXCITED]: [t("pet.excited.0"), t("pet.excited.1"), t("pet.excited.2")],
      [PET_MOODS.SAD]: [t("pet.sad.0"), t("pet.sad.1"), t("pet.sad.2")],
      [PET_MOODS.SURPRISED]: [t("pet.surprised.0"), t("pet.surprised.1"), t("pet.surprised.2")],
      [PET_MOODS.ANGRY]: [t("pet.angry.0"), t("pet.angry.1"), t("pet.angry.2")]
    };
    const moodActions = {
      [PET_MOODS.IDLE]: [PET_ACTIONS.BLINK, PET_ACTIONS.SNIFF, PET_ACTIONS.LOOK_LEFT, PET_ACTIONS.LOOK_RIGHT],
      [PET_MOODS.HAPPY]: [PET_ACTIONS.SMILE, PET_ACTIONS.WAG, PET_ACTIONS.TONGUE, PET_ACTIONS.GREET_COMBO],
      [PET_MOODS.CURIOUS]: [PET_ACTIONS.SNIFF, PET_ACTIONS.LOOK_LEFT, PET_ACTIONS.LOOK_RIGHT, PET_ACTIONS.TILT_LEFT, PET_ACTIONS.TILT_RIGHT],
      [PET_MOODS.NEEDY]: [PET_ACTIONS.POUT, PET_ACTIONS.WAG, PET_ACTIONS.TILT_LEFT],
      [PET_MOODS.SLEEPY]: [PET_ACTIONS.BLINK, PET_ACTIONS.DOUBLE_BLINK, PET_ACTIONS.YAWN, PET_ACTIONS.EAR_DROP],
      [PET_MOODS.SHY]: [PET_ACTIONS.POUT, PET_ACTIONS.BLINK, PET_ACTIONS.TILT_LEFT],
      [PET_MOODS.EXCITED]: [PET_ACTIONS.WAG, PET_ACTIONS.TONGUE, PET_ACTIONS.GREET_COMBO, PET_ACTIONS.SHAKE],
      [PET_MOODS.SAD]: [PET_ACTIONS.EAR_DROP, PET_ACTIONS.POUT, PET_ACTIONS.DOUBLE_BLINK],
      [PET_MOODS.SURPRISED]: [PET_ACTIONS.OPEN_MOUTH, PET_ACTIONS.LOOK_LEFT, PET_ACTIONS.SHAKE],
      [PET_MOODS.ANGRY]: [PET_ACTIONS.SHAKE, PET_ACTIONS.LOOK_RIGHT, PET_ACTIONS.POUT]
    };
    const actionDuration = {
      [PET_ACTIONS.IDLE]: 0,
      [PET_ACTIONS.BLINK]: 180,
      [PET_ACTIONS.DOUBLE_BLINK]: 420,
      [PET_ACTIONS.SNIFF]: 620,
      [PET_ACTIONS.SMILE]: 560,
      [PET_ACTIONS.OPEN_MOUTH]: 620,
      [PET_ACTIONS.POUT]: 450,
      [PET_ACTIONS.TONGUE]: 820,
      [PET_ACTIONS.WAG]: 500,
      [PET_ACTIONS.CUDDLE]: 450,
      [PET_ACTIONS.YAWN]: 960,
      [PET_ACTIONS.LOOK_LEFT]: 520,
      [PET_ACTIONS.LOOK_RIGHT]: 520,
      [PET_ACTIONS.TILT_LEFT]: 520,
      [PET_ACTIONS.TILT_RIGHT]: 520,
      [PET_ACTIONS.EAR_DROP]: 650,
      [PET_ACTIONS.EAR_PERK]: 480,
      [PET_ACTIONS.NUZZLE]: 550,
      [PET_ACTIONS.SHAKE]: 420,
      [PET_ACTIONS.GREET_COMBO]: 1100
    };
    const actionNameMap = Object.values(PET_ACTIONS).reduce((accumulator, actionName) => {
      accumulator[actionName] = actionName;
      return accumulator;
    }, {});
    const runtime = {
      mood: PET_MOODS.IDLE,
      action: PET_ACTIONS.IDLE,
      face: PET_FACES.NORMAL,
      affection: 60,
      boredom: 0,
      hover: false,
      busyUntil: 0,
      pauseUntil: 0,
      lastInteractionAt: Date.now(),
      lastAutoActionAt: 0,
      isScanning: false,
      pointerX: window.innerWidth / 2,
      pointerY: window.innerHeight / 2,
      eyeResetTimer: 0
    };

    function bindEvents() {
      elements.button.addEventListener("mouseenter", () => {
        runtime.hover = true;
        touch();
        setMood(PET_MOODS.SHY);
        showBlush();
        playAction(PET_ACTIONS.SMILE, true);
        showBubble("heart");
      });

      elements.button.addEventListener("mouseleave", () => {
        runtime.hover = false;
      });
    }

    function start() {
      bindEvents();
      applyFace(PET_FACES.NORMAL);
      loop();
      scheduleBlink();
    }

    function loop() {
      const now = Date.now();
      decay(now);
      autoMood(now);
      autoAction(now);
      window.requestAnimationFrame(loop);
    }

    function touch() {
      runtime.lastInteractionAt = Date.now();
      runtime.pauseUntil = 0;
    }

    function sync(payload) {
      runtime.isScanning = Boolean(payload?.isScanning);
      if (payload?.isDragging) {
        runtime.pauseUntil = Date.now() + 300;
      }
    }

    function handlePrimaryAction(clientX, clientY) {
      if (typeof clientX === "number" && typeof clientY === "number") {
        runtime.pointerX = clientX;
        runtime.pointerY = clientY;
      }
      touch();
      runtime.affection = Math.min(100, runtime.affection + 8);
      runtime.boredom = Math.max(0, runtime.boredom - 12);
      setMood(runtime.affection > 80 ? PET_MOODS.EXCITED : PET_MOODS.NEEDY);
      playAction(PET_ACTIONS.GREET_COMBO, true);
      showBubble("heart");
    }

    function handleScanFeedback() {
      touch();
      runtime.affection = Math.min(100, runtime.affection + 1.5);
      setMood(PET_MOODS.EXCITED, false);
      playAction(PET_ACTIONS.WAG, true);
      if (Math.random() < 0.55) {
        playAction(PET_ACTIONS.SMILE, true);
      }
      showBubble("star");
    }

    function handleRemoteCommand(command) {
      const commandType = String(command?.command_type || command?.type || "").trim().toLowerCase();
      const payload = command?.payload && typeof command.payload === "object" ? command.payload : {};

      if (commandType === "action") {
        return triggerRemoteAction(payload.action || command?.action || "");
      }

      if (commandType === "text") {
        setRemoteDisplayText(payload.text ?? command?.text ?? "");
        return true;
      }

      return false;
    }

    function triggerRemoteAction(actionName) {
      const normalizedAction = String(actionName || "").trim().toLowerCase();
      const action = actionNameMap[normalizedAction];
      if (!action || action === PET_ACTIONS.IDLE) {
        return false;
      }

      touch();
      playAction(action, true);
      if (action === PET_ACTIONS.SMILE || action === PET_ACTIONS.GREET_COMBO || action === PET_ACTIONS.WAG) {
        showBubble("heart");
      } else if (action === PET_ACTIONS.YAWN) {
        showBubble("sleep");
      } else if (action === PET_ACTIONS.SHAKE) {
        showBubble("alert");
      }
      return true;
    }

    function setRemoteDisplayText(text) {
      if (state.remoteDisplayResetTimer) {
        window.clearTimeout(state.remoteDisplayResetTimer);
        state.remoteDisplayResetTimer = 0;
      }
      state.remoteDisplayText = String(text || "");
      scheduleSync();
    }

    function decay(now) {
      const idleMs = now - runtime.lastInteractionAt;
      if (idleMs > 5000) {
        runtime.boredom = Math.min(100, runtime.boredom + 0.018);
      }
      if (!runtime.hover) {
        runtime.affection = Math.max(0, runtime.affection - 0.002);
      }
    }

    function autoMood(now) {
      if (runtime.isScanning) {
        setMood(PET_MOODS.EXCITED, false);
        return;
      }

      const idleMs = now - runtime.lastInteractionAt;
      if (idleMs > 32000) {
        setMood(PET_MOODS.SAD, false);
        return;
      }
      if (idleMs > 18000) {
        setMood(PET_MOODS.SLEEPY, false);
        return;
      }
      if (runtime.hover && runtime.affection > 70) {
        setMood(PET_MOODS.HAPPY, false);
        return;
      }
      if (runtime.boredom > 58) {
        setMood(PET_MOODS.NEEDY, false);
        return;
      }
      if (!runtime.hover && idleMs < 4500 && runtime.affection > 78) {
        setMood(PET_MOODS.HAPPY, false);
        return;
      }
      if (!runtime.hover && idleMs < 9000) {
        setMood(PET_MOODS.CURIOUS, false);
        return;
      }
      setMood(PET_MOODS.IDLE, false);
    }

    function autoAction(now) {
      if (now < runtime.busyUntil || now < runtime.pauseUntil || now - runtime.lastAutoActionAt < nextActionDelay()) {
        return;
      }

      if (Math.random() < 0.22) {
        runtime.pauseUntil = now + 900 + Math.random() * 900;
        runtime.lastAutoActionAt = now;
        return;
      }

      const pool = moodActions[runtime.mood] || moodActions[PET_MOODS.IDLE];
      const action = pool[Math.floor(Math.random() * pool.length)];
      playAction(action);

      if (Math.random() < 0.32) {
        reactBubbleByMood(runtime.mood, false);
      }

      runtime.lastAutoActionAt = now;
    }

    function nextActionDelay() {
      switch (runtime.mood) {
        case PET_MOODS.EXCITED:
          return 1100 + Math.random() * 900;
        case PET_MOODS.NEEDY:
          return 1400 + Math.random() * 1300;
        case PET_MOODS.SLEEPY:
          return 2600 + Math.random() * 2200;
        case PET_MOODS.SAD:
          return 2400 + Math.random() * 1800;
        case PET_MOODS.ANGRY:
          return 1500 + Math.random() * 1000;
        default:
          return 1700 + Math.random() * 2100;
      }
    }

    function scheduleBlink() {
      const blinkLoop = () => {
        if (Date.now() >= runtime.busyUntil) {
          playAction(Math.random() < 0.25 ? PET_ACTIONS.DOUBLE_BLINK : PET_ACTIONS.BLINK, true);
        }
        window.setTimeout(blinkLoop, 2400 + Math.random() * 2600);
      };
      blinkLoop();
    }

    function setMood(mood, updateLabelOnChange = true) {
      if (!mood) {
        return;
      }
      const changed = runtime.mood !== mood;
      runtime.mood = mood;
      setFace(moodFaceMap[mood] || PET_FACES.NORMAL);
      if (changed && updateLabelOnChange) {
        updateLabelByMood();
      }
    }

    function setFace(face) {
      if (runtime.face === face) {
        return;
      }
      stopEyeFollow();
      runtime.face = face;
      applyFace(face);
    }

    function applyFace(face) {
      const preset = PET_FACE_PRESETS[face] || PET_FACE_PRESETS.normal;
      elements.buttonEyes.forEach((eye) => {
        eye.style.transform = `scaleY(${preset.eyeScaleY})`;
      });
      elements.buttonBrowLeft.style.transform = preset.browLeft;
      elements.buttonBrowRight.style.transform = preset.browRight;
      elements.buttonMouth.setAttribute("d", preset.mouth);
      elements.buttonBlushes.forEach((blush) => {
        blush.style.opacity = String(preset.blush);
      });
    }

    function updateLabelByMood() {
      const words = labelMap[runtime.mood] || labelMap[PET_MOODS.IDLE];
      updateLabel(words[Math.floor(Math.random() * words.length)]);
    }

    function updateLabel(text) {
      if (!elements.buttonLabel) {
        return;
      }
      elements.buttonLabel.style.opacity = "0.35";
      elements.buttonLabel.style.transform = "translateY(2px)";
      window.setTimeout(() => {
        elements.buttonLabel.textContent = text;
        elements.buttonLabel.style.opacity = "1";
        elements.buttonLabel.style.transform = "translateY(0)";
      }, 110);
    }

    function playAction(action, force = false) {
      const now = Date.now();
      if (!force && now < runtime.busyUntil) {
        return false;
      }

      runtime.action = action;
      runtime.busyUntil = now + (actionDuration[action] || 400);

      switch (action) {
        case PET_ACTIONS.BLINK:
          elements.buttonEyes.forEach((eye) => replayClass(eye, "blink"));
          break;
        case PET_ACTIONS.DOUBLE_BLINK:
          elements.buttonEyes.forEach((eye) => replayClass(eye, "double-blink"));
          break;
        case PET_ACTIONS.SNIFF:
          replayClass(elements.buttonNose, "sniff");
          replayClass(elements.buttonEarLeft, "ear-flap-left");
          replayClass(elements.buttonEarRight, "ear-flap-right");
          break;
        case PET_ACTIONS.SMILE:
          replayClass(elements.buttonMouth, "smile");
          showBlush();
          break;
        case PET_ACTIONS.OPEN_MOUTH:
          replayClass(elements.buttonMouth, "open-mouth");
          break;
        case PET_ACTIONS.POUT:
          replayClass(elements.buttonMouth, "pout");
          break;
        case PET_ACTIONS.TONGUE:
          elements.buttonTongue.style.opacity = "1";
          replayClass(elements.buttonTongue, "tongue");
          window.setTimeout(() => {
            elements.buttonTongue.classList.remove("tongue");
            elements.buttonTongue.style.opacity = "0";
          }, 820);
          break;
        case PET_ACTIONS.WAG:
          replayClass(elements.buttonTailTip, "wag");
          break;
        case PET_ACTIONS.CUDDLE:
          replayClass(elements.button, "nuzzle");
          showBlush();
          break;
        case PET_ACTIONS.YAWN:
          replayClass(elements.buttonMouth, "open-mouth");
          setFace(PET_FACES.SLEEPY);
          window.setTimeout(() => {
            playAction(PET_ACTIONS.DOUBLE_BLINK, true);
          }, 180);
          showBubble("sleep");
          break;
        case PET_ACTIONS.LOOK_LEFT:
          replayClass(elements.button, "look-left");
          break;
        case PET_ACTIONS.LOOK_RIGHT:
          replayClass(elements.button, "look-right");
          break;
        case PET_ACTIONS.TILT_LEFT:
          replayClass(elements.buttonHeadGroup, "tilt-left");
          break;
        case PET_ACTIONS.TILT_RIGHT:
          replayClass(elements.buttonHeadGroup, "tilt-right");
          break;
        case PET_ACTIONS.EAR_DROP:
          replayClass(elements.buttonEarLeft, "ear-drop-left");
          replayClass(elements.buttonEarRight, "ear-drop-right");
          break;
        case PET_ACTIONS.EAR_PERK:
          replayClass(elements.buttonEarLeft, "ear-flap-left");
          replayClass(elements.buttonEarRight, "ear-flap-right");
          break;
        case PET_ACTIONS.NUZZLE:
          replayClass(elements.button, "nuzzle");
          showBlush();
          break;
        case PET_ACTIONS.SHAKE:
          replayClass(elements.buttonHeadGroup, "shake");
          break;
        case PET_ACTIONS.GREET_COMBO:
          comboActions([
            [0, PET_ACTIONS.WAG],
            [120, PET_ACTIONS.SMILE],
            [260, PET_ACTIONS.TILT_LEFT]
          ]);
          showBubble("heart");
          break;
      }

      return true;
    }

    function comboActions(queue) {
      queue.forEach(([delay, action]) => {
        window.setTimeout(() => {
          playAction(action, true);
        }, delay);
      });
    }

    function updateEyes(clientX, clientY) {
      if (!elements?.button || !elements.buttonPupils?.length) {
        return;
      }
      runtime.pointerX = clientX;
      runtime.pointerY = clientY;
      if (elements.button.classList.contains("look-left") || elements.button.classList.contains("look-right")) {
        return;
      }
      if (runtime.eyeResetTimer) {
        window.clearTimeout(runtime.eyeResetTimer);
        runtime.eyeResetTimer = 0;
      }
      setPupilTransition("transform 70ms linear");

      const rect = elements.button.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      const y = ((clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;

      let factor = 1.1;
      if (runtime.mood === PET_MOODS.SHY) {
        factor = 0.7;
      } else if (runtime.mood === PET_MOODS.CURIOUS) {
        factor = 1.35;
      } else if (runtime.mood === PET_MOODS.SLEEPY) {
        factor = 0.45;
      } else if (runtime.mood === PET_MOODS.SURPRISED) {
        factor = 1.55;
      }

      const offsetX = Math.max(-1.6, Math.min(1.6, x * factor));
      const offsetY = Math.max(-1.6, Math.min(1.6, y * factor));

      elements.buttonPupils.forEach((pupil) => {
        pupil.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      });
      runtime.eyeResetTimer = window.setTimeout(() => {
        beginEyeReset();
      }, 180);
    }

    function beginEyeReset() {
      setPupilTransition("transform 320ms cubic-bezier(0.22, 1, 0.36, 1)");
      resetEyes();
      runtime.eyeResetTimer = window.setTimeout(() => {
        runtime.eyeResetTimer = 0;
        setPupilTransition("");
      }, 340);
    }

    function stopEyeFollow() {
      if (runtime.eyeResetTimer) {
        window.clearTimeout(runtime.eyeResetTimer);
        runtime.eyeResetTimer = 0;
      }
      setPupilTransition("transform 220ms cubic-bezier(0.22, 1, 0.36, 1)");
      resetEyes();
      runtime.eyeResetTimer = window.setTimeout(() => {
        runtime.eyeResetTimer = 0;
        setPupilTransition("");
      }, 240);
    }

    function resetEyes() {
      elements.buttonPupils.forEach((pupil) => {
        pupil.style.transform = "translate(0px, 0px)";
      });
    }

    function setPupilTransition(value) {
      elements.buttonPupils.forEach((pupil) => {
        pupil.style.transition = value || "";
      });
    }

    function showBlush() {
      elements.buttonBlushes.forEach((blush) => {
        replayClass(blush, "show-blush");
      });
    }

    function reactBubbleByMood(mood, strong = false) {
      const map = {
        [PET_MOODS.HAPPY]: "heart",
        [PET_MOODS.CURIOUS]: "question",
        [PET_MOODS.NEEDY]: "heart",
        [PET_MOODS.SLEEPY]: "sleep",
        [PET_MOODS.SHY]: "heart",
        [PET_MOODS.EXCITED]: "star",
        [PET_MOODS.SAD]: "sweat",
        [PET_MOODS.SURPRISED]: "alert",
        [PET_MOODS.ANGRY]: "anger",
        [PET_MOODS.IDLE]: strong ? "star" : null
      };
      const type = map[mood];
      if (type) {
        showBubble(type);
      }
    }

    function showBubble(type) {
      const current = elements.buttonBubbles[type];
      if (!current) {
        return;
      }

      Object.values(elements.buttonBubbles).forEach((bubble) => {
        bubble.classList.remove("bubble-pop");
        bubble.style.opacity = "0";
      });

      void current.offsetWidth;
      current.classList.add("bubble-pop");
    }

    function replayClass(node, className) {
      node.classList.remove(className);
      void node.offsetWidth;
      node.classList.add(className);

      const duration = {
        "look-left": 520,
        "look-right": 520,
        "tilt-left": 520,
        "tilt-right": 520,
        nuzzle: 550,
        shake: 420,
        wag: 500,
        "show-blush": 950,
        "ear-drop-left": 650,
        "ear-drop-right": 650,
        "ear-flap-left": 460,
        "ear-flap-right": 460
      }[className];

      if (duration) {
        window.setTimeout(() => {
          node.classList.remove(className);
        }, duration);
      }
    }

    start();

    return {
      handlePrimaryAction,
      handleScanFeedback,
      handleRemoteCommand,
      sync,
      updateEyes
    };
  }

  window.OnecaiPet = {
    createController: createPetController
  };
})();
