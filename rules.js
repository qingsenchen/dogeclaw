(function () {
  const PLATFORM = globalThis.DogePlatform || globalThis.OnecaiPlatform || {};
  const MAX_DEFAULT_IMAGES = 120;
  const MAX_AMAZON_IMAGES = 140;
  const MAX_TMALL_IMAGES = 180;
  const MAX_1688_IMAGES = 240;
  const MAX_ARXIV_IMAGES = 120;
  const DEFAULT_FILTER_FORMATS = ["png", "jpg", "webp", "avif", "gif", "svg", "other"];
  const DEFAULT_ASSET_SELECTOR = [
    "img",
    "picture source",
    "[data-src]",
    "[data-lazy-src]",
    "[data-lazyload]",
    "[data-ks-lazyload]",
    "[data-big-pic]",
    "[data-zoom-src]",
    "[srcset]",
    "[data-srcset]"
  ].join(", ");

  function sendRuntimeMessage(payload) {
    if (PLATFORM.runtime?.sendMessage) {
      return PLATFORM.runtime.sendMessage(payload);
    }
    const runtime = globalThis.chrome?.runtime;
    return runtime ? runtime.sendMessage(payload) : Promise.resolve(null);
  }

  function createFilterConfig(overrides = {}) {
    const basePresets = [
      { id: "all", label: "全部", criteria: {} },
      { id: "min-800", label: "宽高>=800", criteria: { minWidth: 800, minHeight: 800 } },
      { id: "min-1200", label: "宽高>=1200", criteria: { minWidth: 1200, minHeight: 1200 } },
      { id: "common-raster", label: "PNG/JPG/WEBP", criteria: { formats: ["png", "jpg", "webp"] } },
      { id: "hd-common", label: "高清常用图", criteria: { minWidth: 1000, minHeight: 1000, formats: ["png", "jpg", "webp"] } },
      { id: "landscape-hd", label: "横图高清", criteria: { minWidth: 1200, minHeight: 800, orientation: "landscape", formats: ["png", "jpg", "webp"] } },
      { id: "portrait-hd", label: "竖图高清", criteria: { minWidth: 800, minHeight: 1200, orientation: "portrait", formats: ["png", "jpg", "webp"] } },
      { id: "square-assets", label: "方图素材", criteria: { minWidth: 800, minHeight: 800, orientation: "square", formats: ["png", "jpg", "webp"] } },
      { id: "transparent-assets", label: "透明素材", criteria: { formats: ["png", "webp", "svg"] } }
    ];

    return {
      defaultPresetId: overrides.defaultPresetId || "all",
      formatOptions: overrides.formatOptions || DEFAULT_FILTER_FORMATS,
      presets: overrides.presets || basePresets
    };
  }

  function createDefaultRule(api) {
    return {
      id: "default",
      maxImages: MAX_DEFAULT_IMAGES,
      filterConfig: createFilterConfig(),
      matches: () => true,
      collect(root = document) {
        root.querySelectorAll("img").forEach((img) => api.collectFromImage(img, "default-img"));
        root.querySelectorAll("picture source").forEach((node) => api.collectFromSource(node, "default-source"));
        root.querySelectorAll(DEFAULT_ASSET_SELECTOR).forEach((node) => api.collectFromElementAssets(node, "default-asset"));
      },
      shouldTrackNode(node) {
        return Boolean(
          api.isElementNode(node) &&
            (api.isImageElement(node) ||
              api.isSourceElement(node) ||
              node.matches?.(DEFAULT_ASSET_SELECTOR) ||
              node.querySelector?.("img, picture source"))
        );
      },
      handleNode(node) {
        if (!api.isElementNode(node)) {
          return;
        }

        if (api.isImageElement(node)) {
          api.collectFromImage(node, "default-img");
        }

        if (api.isSourceElement(node)) {
          api.collectFromSource(node, "default-source");
        }

        api.collectFromElementAssets(node, "default-asset");
        node.querySelectorAll?.("img").forEach((img) => api.collectFromImage(img, "default-img"));
        node.querySelectorAll?.("picture source").forEach((source) => api.collectFromSource(source, "default-source"));
        node.querySelectorAll?.(DEFAULT_ASSET_SELECTOR).forEach((child) => api.collectFromElementAssets(child, "default-asset"));
      }
    };
  }

  function createAmazonRule(api) {
    const AMAZON_DETAIL_SCOPE = [
      "#dp",
      "#ppd",
      "#dp-container",
      "#imageBlock_feature_div",
      "#main-image-container",
      "#imgTagWrapperId",
      "#altImages",
      "#aplus",
      "#aplus_feature_div",
      "#dpx-aplus-product-description_feature_div",
      "#productDescription",
      "#productDescription_feature_div"
    ].join(", ");

    const AMAZON_PRODUCT_IMAGE_SELECTORS = [
      "#landingImage",
      "#imgBlkFront",
      "#ebooksImgBlkFront",
      "#imgTagWrapperId img",
      "#main-image-container img",
      "#imageBlock img",
      "#altImages img",
      "[data-a-dynamic-image]",
      "[data-old-hires]",
      "[data-zoom-image]"
    ].join(", ");

    const AMAZON_DESCRIPTION_IMAGE_SELECTORS = [
      "#aplus img",
      "#aplus_feature_div img",
      "#dpx-aplus-product-description_feature_div img",
      "#productDescription img",
      "#productDescription_feature_div img",
      "#feature-bullets img"
    ].join(", ");

    function isAmazonDetailPage(root = document) {
      if (!/amazon\./i.test(location.hostname)) {
        return false;
      }

      const hasAsin = root.querySelector("input#ASIN, input[name='ASIN'], input[name='ASIN.0']");
      const hasTitle = root.querySelector("#productTitle, [data-feature-name='title'] h1, #title");
      const hasImageBlock = root.querySelector("#imageBlock_feature_div, #main-image-container, #imgTagWrapperId, #altImages");
      return Boolean((hasAsin || hasTitle) && hasImageBlock);
    }

    function addAmazonImage(url, source) {
      if (typeof url === "string" && url) {
        api.addImage({ url: url.replace(/\\\//g, "/"), source });
      }
    }

    function collectDynamicImageFromElement(node, source) {
      if (!api.isElementNode(node)) {
        return;
      }

      const dynamicImage = node.getAttribute("data-a-dynamic-image");
      if (dynamicImage) {
        try {
          const parsed = JSON.parse(dynamicImage);
          Object.keys(parsed || {}).forEach((url) => addAmazonImage(url, source));
        } catch {}
      }

      [
        node.getAttribute("data-old-hires"),
        node.getAttribute("data-zoom-image"),
        node.getAttribute("data-aux-image-url"),
        node.getAttribute("src")
      ].forEach((url) => addAmazonImage(url, source));
    }

    function collectImagesFromRelevantScripts(root = document) {
      root.querySelectorAll("script").forEach((script) => {
        const text = script.textContent || "";
        if (!/(ImageBlockATF|imageBlock|colorImages|initial)/.test(text)) {
          return;
        }

        const urlPatterns = [
          /"hiRes"\s*:\s*"([^"]+)"/g,
          /"large"\s*:\s*"([^"]+)"/g,
          /"mainUrl"\s*:\s*"([^"]+)"/g,
          /"thumbUrl"\s*:\s*"([^"]+)"/g,
          /https?:\\\/\\\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp)/g
        ];

        urlPatterns.forEach((pattern) => {
          let match;
          while ((match = pattern.exec(text))) {
            addAmazonImage(match[1] || match[0], "amazon-script");
          }
        });
      });
    }

    function collect(root = document) {
      root.querySelectorAll(AMAZON_PRODUCT_IMAGE_SELECTORS).forEach((node) => {
        if (api.isImageElement(node)) {
          api.collectFromImage(node, "amazon-main");
        }
        collectDynamicImageFromElement(node, "amazon-main");
      });

      root.querySelectorAll(AMAZON_DESCRIPTION_IMAGE_SELECTORS).forEach((img) => {
        api.collectFromImage(img, "amazon-description");
        collectDynamicImageFromElement(img, "amazon-description");
      });

      collectImagesFromRelevantScripts(root);
    }

    return {
      id: "amazon-product",
      maxImages: MAX_AMAZON_IMAGES,
      filterConfig: createFilterConfig({
        presets: [
          { id: "all", label: "全部", criteria: {} },
          { id: "hero-images", label: "主图常用", criteria: { minWidth: 1000, minHeight: 1000, formats: ["jpg", "png", "webp"] } },
          { id: "landscape-hd", label: "横图高清", criteria: { minWidth: 1200, minHeight: 800, orientation: "landscape", formats: ["jpg", "png", "webp"] } },
          { id: "detail-assets", label: "详情高清图", criteria: { minWidth: 800, minHeight: 800, formats: ["jpg", "png", "webp"] } },
          { id: "transparent-assets", label: "透明素材", criteria: { formats: ["png", "webp"] } }
        ]
      }),
      matches: () => isAmazonDetailPage(document),
      collect,
      shouldTrackNode(node) {
        if (!api.isElementNode(node)) {
          return false;
        }

        return Boolean(
          node.matches?.(`${AMAZON_PRODUCT_IMAGE_SELECTORS}, ${AMAZON_DESCRIPTION_IMAGE_SELECTORS}, ${AMAZON_DETAIL_SCOPE}, ${AMAZON_DETAIL_SCOPE} *`) ||
            node.closest?.(AMAZON_DETAIL_SCOPE)
        );
      },
      handleNode(node) {
        if (!api.isElementNode(node)) {
          return;
        }

        if (node.matches?.(AMAZON_PRODUCT_IMAGE_SELECTORS) || node.matches?.(AMAZON_DESCRIPTION_IMAGE_SELECTORS)) {
          if (api.isImageElement(node)) {
            const inDescription = node.closest?.(
              "#aplus, #aplus_feature_div, #dpx-aplus-product-description_feature_div, #productDescription, #productDescription_feature_div, #feature-bullets"
            );
            api.collectFromImage(node, inDescription ? "amazon-description" : "amazon-main");
          }
          collectDynamicImageFromElement(
            node,
            node.closest?.("#aplus, #aplus_feature_div, #dpx-aplus-product-description_feature_div, #productDescription, #productDescription_feature_div, #feature-bullets")
              ? "amazon-description"
              : "amazon-main"
          );
        }

        node.querySelectorAll?.(AMAZON_PRODUCT_IMAGE_SELECTORS).forEach((child) => {
          if (api.isImageElement(child)) {
            api.collectFromImage(child, "amazon-main");
          }
          collectDynamicImageFromElement(child, "amazon-main");
        });

        node.querySelectorAll?.(AMAZON_DESCRIPTION_IMAGE_SELECTORS).forEach((child) => {
          if (api.isImageElement(child)) {
            api.collectFromImage(child, "amazon-description");
          }
          collectDynamicImageFromElement(child, "amazon-description");
        });

        if (node.tagName?.toLowerCase() === "script" || node.querySelector?.("script")) {
          collectImagesFromRelevantScripts(node);
        }
      }
    };
  }

  function createTmallRule(api) {
    const TMALL_SCOPE = [
      "#J_DetailMeta",
      "#J_Detail",
      "#description",
      "#J_DivItemDesc",
      "#J_DivItemDescTFS",
      "#J_UlThumb",
      "#J_ImgBooth",
      "#J_Main",
      "[class*='detail-content']",
      "[class*='ItemDescription']",
      "[data-spm='detail']"
    ].join(", ");

    const TMALL_PRODUCT_IMAGE_SELECTORS = [
      "#J_ImgBooth",
      "#J_ImgBooth img",
      "#J_UlThumb img",
      "[id*='sku'] img",
      "[class*='sku'] img",
      "[class*='Gallery'] img",
      "[class*='gallery'] img",
      "[data-src*='alicdn.com']",
      "[data-ks-lazyload*='alicdn.com']"
    ].join(", ");

    const TMALL_DESCRIPTION_IMAGE_SELECTORS = [
      "#description img",
      "#J_DivItemDesc img",
      "#J_DivItemDescTFS img",
      "[class*='detail-content'] img",
      "[class*='ItemDescription'] img"
    ].join(", ");

    function parseLooseJsonObject(text, pattern) {
      const match = String(text || "").match(pattern);
      if (!match?.[1]) {
        return null;
      }

      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }

    function addTmallImage(url, source) {
      if (typeof url === "string" && url) {
        api.addImage({ url: url.replace(/\\\//g, "/"), source });
      }
    }

    function extractDescUrlFromScripts(root = document) {
      const scripts = Array.from(root.scripts || []);
      for (const script of scripts) {
        const text = script.textContent || "";
        if (!text) {
          continue;
        }

        const patterns = [
          /"apiDescUrl"\s*:\s*"([^"]+)"/,
          /"descUrl"\s*:\s*"([^"]+)"/,
          /"httpsDescUrl"\s*:\s*"([^"]+)"/,
          /apiDescUrl['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
          /descUrl['"]?\s*[:=]\s*['"]([^'"]+)['"]/
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match?.[1]) {
            return match[1].replace(/\\\//g, "/");
          }
        }
      }

      return null;
    }

    function collectProductImagesFromScripts(root = document) {
      Array.from(root.scripts || []).forEach((script) => {
        const text = script.textContent || "";
        if (!/(auctionImages|itemImages|propertyPics|skuMap|valItemInfo|TShop\.Setup)/.test(text)) {
          return;
        }

        const urlPatterns = [
          /https?:\\\/\\\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp|gif)/gi,
          /https?:\/\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp|gif)/gi
        ];

        urlPatterns.forEach((pattern) => {
          let match;
          while ((match = pattern.exec(text))) {
            addTmallImage(match[0], "tmall-script");
          }
        });

        const propertyPics = parseLooseJsonObject(text, /"propertyPics"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
        if (propertyPics && typeof propertyPics === "object") {
          Object.values(propertyPics).forEach((list) => {
            (Array.isArray(list) ? list : []).forEach((url) => addTmallImage(url, "tmall-sku"));
          });
        }
      });
    }

    function collectDescriptionFromDom(root = document) {
      root.querySelectorAll(TMALL_DESCRIPTION_IMAGE_SELECTORS).forEach((img) => {
        api.collectFromImage(img, "tmall-description");
      });
    }

    function collect(root = document) {
      root.querySelectorAll(TMALL_PRODUCT_IMAGE_SELECTORS).forEach((node) => {
        if (api.isImageElement(node)) {
          api.collectFromImage(node, "tmall-main");
        }
        api.collectFromElementAssets(node, "tmall-main-asset");
      });

      collectDescriptionFromDom(root);
      collectProductImagesFromScripts(root);
    }

    async function collectDescriptionFromRemote() {
      const descUrl = extractDescUrlFromScripts(document);
      if (!descUrl) {
        return;
      }

      try {
        const response = await sendRuntimeMessage({
          type: "fetchText",
          url: descUrl
        });

        if (!response?.ok || !response.text) {
          return;
        }

        const raw = String(response.text || "");
        const matches = raw.match(/https?:\\?\/\\?\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
        matches.forEach((url) => {
          addTmallImage(url.replace(/\\\//g, "/"), "tmall-description-remote");
        });
      } catch {}
    }

    return {
      id: "tmall-item",
      maxImages: MAX_TMALL_IMAGES,
      filterConfig: createFilterConfig({
        presets: [
          { id: "all", label: "全部", criteria: {} },
          { id: "detail-hd", label: "详情高清图", criteria: { minWidth: 1000, minHeight: 1000, formats: ["jpg", "png", "webp"] } },
          { id: "hero-images", label: "主图常用", criteria: { minWidth: 1200, minHeight: 1200, formats: ["jpg", "png", "webp"] } },
          { id: "landscape-hd", label: "横图高清", criteria: { minWidth: 1200, minHeight: 800, orientation: "landscape", formats: ["jpg", "png", "webp"] } },
          { id: "square-assets", label: "方图素材", criteria: { minWidth: 800, minHeight: 800, orientation: "square", formats: ["jpg", "png", "webp"] } },
          { id: "transparent-assets", label: "透明素材", criteria: { formats: ["png", "webp"] } }
        ]
      }),
      matches: () =>
        /(^|\.)(tmall\.com|tmall\.hk)$/i.test(location.hostname) &&
        Boolean(
          document.querySelector("input[name='item_id'], input[name='itemId'], #J_ImgBooth, #J_UlThumb, #J_DetailMeta, #J_DivItemDesc")
        ),
      collect,
      collectAsync: collectDescriptionFromRemote,
      shouldTrackNode(node) {
        if (!api.isElementNode(node)) {
          return false;
        }

        return Boolean(
          node.matches?.(`${TMALL_PRODUCT_IMAGE_SELECTORS}, ${TMALL_DESCRIPTION_IMAGE_SELECTORS}, ${TMALL_SCOPE}, ${TMALL_SCOPE} *`) ||
            node.closest?.(TMALL_SCOPE)
        );
      },
      handleNode(node) {
        if (!api.isElementNode(node)) {
          return;
        }

        if (api.isImageElement(node)) {
          const inDescription = node.closest?.("#description, #J_DivItemDesc, #J_DivItemDescTFS, [class*='detail-content'], [class*='ItemDescription']");
          api.collectFromImage(node, inDescription ? "tmall-description" : "tmall-main");
        }

        api.collectFromElementAssets(node, "tmall-asset");
        node.querySelectorAll?.(TMALL_PRODUCT_IMAGE_SELECTORS).forEach((child) => {
          if (api.isImageElement(child)) {
            api.collectFromImage(child, "tmall-main");
          }
          api.collectFromElementAssets(child, "tmall-main-asset");
        });
        node.querySelectorAll?.(TMALL_DESCRIPTION_IMAGE_SELECTORS).forEach((child) => {
          if (api.isImageElement(child)) {
            api.collectFromImage(child, "tmall-description");
          }
        });

        if (node.tagName?.toLowerCase() === "script" || node.querySelector?.("script")) {
          collectProductImagesFromScripts(node);
        }
      }
    };
  }

  function create1688Rule(api) {
    function parseLooseJsonObject(text, pattern) {
      const match = String(text || "").match(pattern);
      if (!match?.[1]) {
        return null;
      }

      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }

    function addImageList(list, source, extractor) {
      (Array.isArray(list) ? list : []).forEach((item) => {
        const url = typeof extractor === "function" ? extractor(item) : item;
        if (typeof url === "string" && url) {
          api.addImage({ url, source });
        }
      });
    }

    function get1688Context() {
      try {
        if (window.context?.result?.data) {
          return window.context.result.data;
        }
      } catch {}

      const scripts = Array.from(document.scripts);
      for (const script of scripts) {
        const text = script.textContent || "";
        if (!text.includes("window.context=")) {
          continue;
        }

        const json = api.parseJsonFromScript(text, /window\.context=\(function\(b,d\).*?\)\(window\.contextPath,(\{[\s\S]*\})\);/);
        if (json?.result?.data) {
          return json.result.data;
        }

        const fallback = parseLooseJsonObject(text, /window\.context=.*?\(window\.contextPath,(\{[\s\S]*\})\);?/);
        if (fallback?.result?.data) {
          return fallback.result.data;
        }
      }

      return null;
    }

    function collectMainImagesFromContext() {
      const data = get1688Context();
      const gallery = data?.gallery?.fields;
      const mainImages = []
        .concat(gallery?.mainImage || [])
        .concat(gallery?.offerImgList || [])
        .concat(data?.globalData?.model?.mainImageList || [])
        .concat(data?.globalData?.model?.imageList || []);

      mainImages.forEach((entry, index) => {
        const url =
          typeof entry === "string"
            ? entry
            : entry?.fullPathImageURI || entry?.imageURI || entry?.size310x310ImageURI || entry?.summImageURI || entry?.searchImageURI;

        if (!url) {
          return;
        }

        api.addImage({
          url,
          source: index < (gallery?.mainImage?.length || 0) ? "1688-main" : "1688-gallery"
        });
      });

      return data?.description?.fields?.detailUrl || null;
    }

    function collectDescriptionUrlsFromText(text) {
      const raw = String(text || "");
      if (!raw) {
        return;
      }

      const candidates = new Set();

      const attrPatterns = [
        /<(?:img|source)[^>]+src=["']([^"'<>]+)["']/gi,
        /<(?:img|source)[^>]+data-src=["']([^"'<>]+)["']/gi,
        /<(?:img|source)[^>]+data-lazy-src=["']([^"'<>]+)["']/gi,
        /<(?:img|source)[^>]+data-lazyload=["']([^"'<>]+)["']/gi,
        /<(?:img|source)[^>]+data-ks-lazyload=["']([^"'<>]+)["']/gi,
        /<(?:img|source)[^>]+data-tfs-url=["']([^"'<>]+)["']/gi,
        /https?:\/\/[^"'\\\s<>]+(?:alicdn\.com|alibaba\.com)[^"'\\\s<>]+\.(?:jpg|jpeg|png|webp|gif)/gi
      ];

      attrPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(raw))) {
          const url = match[1] || match[0];
          if (url) {
            candidates.add(url.replace(/\\\//g, "/"));
          }
        }
      });

      const offerDetails = parseLooseJsonObject(raw, /var\s+offer_details\s*=\s*(\{[\s\S]*?\});?/);
      if (typeof offerDetails?.content === "string") {
        attrPatterns.forEach((pattern) => {
          let match;
          while ((match = pattern.exec(offerDetails.content))) {
            const url = match[1] || match[0];
            if (url) {
              candidates.add(url.replace(/\\\//g, "/"));
            }
          }
        });
      }

      const rawEscapedUrls = raw.match(/https?:\\\/\\\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
      rawEscapedUrls.forEach((url) => {
        candidates.add(url.replace(/\\\//g, "/"));
      });

      Array.from(candidates).forEach((url) => {
        api.addImage({
          url,
          source: "1688-description-remote"
        });
      });
    }

    function collectDescriptionFromDom(root = document) {
      const selectors = [
        "#description img",
        "[id*='description'] img",
        "[class*='description'] img",
        "[class*='detail'] img",
        "[data-id='description'] img",
        ".desc-lazyload-wrapper img",
        ".detail-desc-decorate-richtext img",
        "[data-component='description'] img",
        "[data-role='detail'] img",
        "[class*='desc'] img",
        "img[usemap^='#_sdmap_']",
        "img[loading='lazy'][usemap]"
      ];

      selectors.forEach((selector) => {
        root.querySelectorAll(selector).forEach((img) => api.collectFromImage(img, "1688-description"));
      });
    }

    async function collectDescriptionFromRemote() {
      const detailUrl = collectMainImagesFromContext();
      if (!detailUrl) {
        return;
      }

      try {
        const response = await sendRuntimeMessage({
          type: "fetchText",
          url: detailUrl
        });

        if (!response?.ok || !response.text) {
          return;
        }

        collectDescriptionUrlsFromText(response.text);
      } catch {}
    }

    function collect(root = document) {
      collectMainImagesFromContext();
      collectDescriptionFromDom(root);

      const mainSelectors = [
        "[class*='gallery'] img",
        "[class*='main-image'] img",
        "[class*='sku-preview'] img",
        "[class*='detail-gallery'] img"
      ];

      mainSelectors.forEach((selector) => {
        root.querySelectorAll(selector).forEach((img) => api.collectFromImage(img, "1688-main-dom"));
      });
    }

    return {
      id: "1688-offer",
      maxImages: MAX_1688_IMAGES,
      filterConfig: createFilterConfig({
        presets: [
          { id: "all", label: "全部", criteria: {} },
          { id: "min-800", label: "宽高>=800", criteria: { minWidth: 800, minHeight: 800 } },
          { id: "detail-hd", label: "详情高清图", criteria: { minWidth: 1000, minHeight: 1000, formats: ["jpg", "png", "webp"] } },
          { id: "hero-images", label: "主图常用", criteria: { minWidth: 1200, minHeight: 1200, formats: ["jpg", "png", "webp"] } },
          { id: "landscape-hd", label: "横图高清", criteria: { minWidth: 1200, minHeight: 800, orientation: "landscape", formats: ["jpg", "png", "webp"] } },
          { id: "square-assets", label: "方图素材", criteria: { minWidth: 800, minHeight: 800, orientation: "square", formats: ["jpg", "png", "webp"] } },
          { id: "transparent-assets", label: "透明素材", criteria: { formats: ["png", "webp", "svg"] } }
        ]
      }),
      matches: () => location.hostname === "detail.1688.com" && /^\/offer\/\d+\.html$/.test(location.pathname),
      collect,
      collectAsync: collectDescriptionFromRemote,
      shouldTrackNode(node) {
        if (!api.isElementNode(node)) {
          return false;
        }

        const matchesSelf =
          node.matches?.(
            "#description, #description *, [id*='description'], [id*='description'] *, [class*='gallery'], [class*='gallery'] *, [class*='detail'], [class*='detail'] *, img[usemap^='#_sdmap_']"
          ) || false;

        const insideKnownContainer =
          node.closest?.("#description, [id*='description'], [class*='gallery'], [class*='detail']") || false;

        return Boolean(matchesSelf || insideKnownContainer || api.isImageElement(node) || api.isSourceElement(node));
      },
      handleNode(node) {
        if (!api.isElementNode(node)) {
          return;
        }

        if (api.isImageElement(node)) {
          const inDescription =
            node.matches?.("img[usemap^='#_sdmap_'], img[loading='lazy'][usemap]") ||
            node.closest?.("#description, [id*='description'], [class*='description'], [class*='detail-desc']");
          api.collectFromImage(node, inDescription ? "1688-description" : "1688-main-dom");
        }

        if (api.isSourceElement(node)) {
          api.collectFromSource(node, "1688-source");
        }

        api.collectFromElementAssets(node, "1688-asset");
        node.querySelectorAll?.("img").forEach((img) => {
          const inDescription =
            img.matches?.("img[usemap^='#_sdmap_'], img[loading='lazy'][usemap]") ||
            img.closest?.("#description, [id*='description'], [class*='description'], [class*='detail-desc']");
          api.collectFromImage(img, inDescription ? "1688-description" : "1688-main-dom");
        });
        node.querySelectorAll?.("picture source").forEach((source) => api.collectFromSource(source, "1688-source"));
      }
    };
  }

  function createArxivPaperRule(api) {
    const PAPER_IMAGE_SELECTOR = [
      "article figure img.ltx_graphics",
      "article figure img[src*='/assets/']",
      "article img.ltx_graphics[src*='/assets/']"
    ].join(", ");

    function getArxivIdFromPath(pathname) {
      const match = String(pathname || "").match(/^\/(?:abs|pdf|html)\/([^/?#]+)/i);
      if (!match?.[1]) {
        return "";
      }

      return match[1].replace(/\.pdf$/i, "").replace(/v\d+$/i, "");
    }

    function getCurrentArxivId() {
      const hostname = location.hostname;
      if (/(^|\.)arxiv\.org$/i.test(hostname) || hostname === "ar5iv.labs.arxiv.org") {
        return getArxivIdFromPath(location.pathname);
      }
      return "";
    }

    function isTargetPaper() {
      if (!/(^|\.)arxiv\.org$/i.test(location.hostname)) {
        return false;
      }

      return /^\/pdf\/[^/?#]+(?:\.pdf)?$/i.test(location.pathname) && Boolean(getCurrentArxivId());
    }

    function isPaperAssetUrl(url, arxivId = getCurrentArxivId()) {
      if (!arxivId) {
        return false;
      }

      const escapedId = arxivId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`/html/${escapedId}/assets/`).test(url) && !/\/(?:logo|ar5iv)[^/]*\.(?:png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(url);
    }

    function addArxivImage(url, source, image = null, baseUrl = location.href, arxivId = getCurrentArxivId()) {
      if (!url) {
        return;
      }

      try {
        const absoluteUrl = new URL(String(url).replace(/&amp;/g, "&"), baseUrl).href;
        if (!isPaperAssetUrl(absoluteUrl, arxivId)) {
          return;
        }

        api.addImage({
          url: absoluteUrl,
          alt: image?.getAttribute?.("alt") || image?.getAttribute?.("title") || "",
          width: Number(image?.getAttribute?.("width")) || image?.naturalWidth || null,
          height: Number(image?.getAttribute?.("height")) || image?.naturalHeight || null,
          source
        });
      } catch {}
    }

    function collectFromAr5ivDocument(doc, baseUrl, arxivId) {
      doc.querySelectorAll(PAPER_IMAGE_SELECTOR).forEach((img) => {
        addArxivImage(img.getAttribute("src") || img.currentSrc || img.src, "arxiv-ar5iv-figure", img, baseUrl, arxivId);
      });
    }

    function collectFromCurrentDom(root = document) {
      root.querySelectorAll?.(PAPER_IMAGE_SELECTOR).forEach((img) => {
        addArxivImage(img.getAttribute("src") || img.currentSrc || img.src, "arxiv-figure-dom", img);
      });
    }

    async function collectFromAr5ivRemote() {
      const arxivId = getCurrentArxivId();
      if (!arxivId) {
        return;
      }

      const ar5ivUrl = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
      try {
        const response = await sendRuntimeMessage({
          type: "fetchText",
          url: ar5ivUrl
        });

        if (!response?.ok || !response.text) {
          return;
        }

        const doc = new DOMParser().parseFromString(response.text, "text/html");
        collectFromAr5ivDocument(doc, ar5ivUrl, arxivId);
      } catch {}
    }

    return {
      id: "arxiv-pdf-paper",
      maxImages: MAX_ARXIV_IMAGES,
      filterConfig: createFilterConfig({
        defaultPresetId: "all",
        presets: [
          { id: "all", label: "全部", criteria: {} },
          { id: "figures", label: "论文图表", criteria: { formats: ["png", "jpg", "webp"] } },
          { id: "landscape", label: "横向图", criteria: { orientation: "landscape", formats: ["png", "jpg", "webp"] } },
          { id: "large-figures", label: "较大图", criteria: { minWidth: 400, minHeight: 100, formats: ["png", "jpg", "webp"] } }
        ]
      }),
      matches: isTargetPaper,
      collect: collectFromCurrentDom,
      collectAsync: collectFromAr5ivRemote,
      shouldTrackNode(node) {
        if (!api.isElementNode(node)) {
          return false;
        }

        return Boolean(node.matches?.(PAPER_IMAGE_SELECTOR) || node.querySelector?.(PAPER_IMAGE_SELECTOR));
      },
      handleNode(node) {
        if (!api.isElementNode(node)) {
          return;
        }

        if (node.matches?.(PAPER_IMAGE_SELECTOR)) {
          addArxivImage(node.getAttribute("src") || node.currentSrc || node.src, "arxiv-figure-dom", node);
        }

        node.querySelectorAll?.(PAPER_IMAGE_SELECTOR).forEach((img) => {
          addArxivImage(img.getAttribute("src") || img.currentSrc || img.src, "arxiv-figure-dom", img);
        });
      }
    };
  }

  window.PageImageGalleryRules = {
    DEFAULT_ASSET_SELECTOR,
    createRules(api) {
      return [createAmazonRule(api), createTmallRule(api), create1688Rule(api), createArxivPaperRule(api), createDefaultRule(api)];
    }
  };
})();
