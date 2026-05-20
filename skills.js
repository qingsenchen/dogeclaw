(function () {
  const PLATFORM = globalThis.DogeclawPlatform || {};

  const BUNDLED_SKILLS = [
    {
      id: "weather",
      path: "skills/weather/SKILL.md",
      enabled: true
    }
  ];

  let skillLoadPromise = null;

  function parseScalar(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    if (text === "true") {
      return true;
    }
    if (text === "false") {
      return false;
    }
    return text;
  }

  function parseFrontmatter(text) {
    const source = String(text || "").replace(/\r\n/g, "\n");
    if (!source.startsWith("---\n")) {
      return { data: {}, body: source.trim() };
    }

    const endIndex = source.indexOf("\n---", 4);
    if (endIndex < 0) {
      return { data: {}, body: source.trim() };
    }

    const frontmatter = source.slice(4, endIndex).trim();
    const body = source.slice(endIndex + 4).trim();
    const data = {};
    frontmatter.split("\n").forEach((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        return;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      data[key] = parseScalar(value);
    });
    return { data, body };
  }

  function getRuntimeUrl(path) {
    try {
      if (typeof PLATFORM.api?.runtime?.getURL === "function") {
        return PLATFORM.api.runtime.getURL(path);
      }
      if (typeof globalThis.chrome?.runtime?.getURL === "function") {
        return globalThis.chrome.runtime.getURL(path);
      }
      if (typeof globalThis.browser?.runtime?.getURL === "function") {
        return globalThis.browser.runtime.getURL(path);
      }
      return "";
    } catch {
      return "";
    }
  }

  async function loadSkill(definition) {
    const url = getRuntimeUrl(definition.path);
    if (!url) {
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const { data, body } = parseFrontmatter(await response.text());
    const name = String(data.name || definition.id || "").trim();
    if (!name || !body) {
      return null;
    }

    return {
      id: definition.id || name,
      name,
      description: String(data.description || "").trim(),
      metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
      body,
      path: definition.path,
      enabled: definition.enabled !== false
    };
  }

  async function loadSkills() {
    if (!skillLoadPromise) {
      skillLoadPromise = Promise.all(BUNDLED_SKILLS.map(loadSkill))
        .then((skills) => skills.filter(Boolean))
        .catch(() => []);
    }
    return skillLoadPromise;
  }

  function getDogeclawMetadata(skill) {
    return skill?.metadata?.dogeclaw && typeof skill.metadata.dogeclaw === "object" ? skill.metadata.dogeclaw : {};
  }

  function getRequiredTools(skill) {
    const tools = getDogeclawMetadata(skill).requires?.tools;
    return Array.isArray(tools) ? tools.map((tool) => String(tool || "").trim()).filter(Boolean) : [];
  }

  function isSkillAvailable(skill, context = {}) {
    if (!skill?.enabled) {
      return false;
    }

    const availableTools = new Set(
      (Array.isArray(context.tools) ? context.tools : [])
        .map((tool) => tool?.function?.name || tool?.name || "")
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    );

    return getRequiredTools(skill).every((toolName) => availableTools.has(toolName));
  }

  function formatSkill(skill) {
    const emoji = String(getDogeclawMetadata(skill).emoji || "").trim();
    const title = [emoji, skill.name].filter(Boolean).join(" ");
    const parts = [
      `## ${title}`,
      skill.description ? `Description: ${skill.description}` : "",
      skill.body
    ].filter(Boolean);
    return parts.join("\n\n");
  }

  async function getEnabledSkills(context = {}) {
    const skills = await loadSkills();
    return skills.filter((skill) => isSkillAvailable(skill, context));
  }

  async function getSystemPrompt(context = {}) {
    const skills = await getEnabledSkills(context);
    if (!skills.length) {
      return "";
    }

    return [
      "# Dogeclaw Skills",
      "Use the following skills when they match the user's request. A skill is guidance for choosing and using the available tools; follow the skill instructions without mentioning them unless the user asks.",
      ...skills.map(formatSkill)
    ].join("\n\n");
  }

  function resetCache() {
    skillLoadPromise = null;
  }

  globalThis.DogeclawSkills = {
    getEnabledSkills,
    getSystemPrompt,
    parseFrontmatter,
    resetCache
  };
})();
