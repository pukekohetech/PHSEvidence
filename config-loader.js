(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PHSConfigLoader = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SETTINGS_LKG_KEY = 'phs-evidence-config-settings-lkg-v1';
  const TEACHING_LKG_KEY = 'phs-evidence-config-teaching-lkg-v1';
  const APPROVED_TOKENS = new Set(['year', 'teacher', 'class', 'student', 'project', 'timestamp']);

  const EMERGENCY_TEACHING = {
    configVersion: 'built-in',
    teachers: [{ code: 'RY', name: 'Mr Reynolds', email: 'ry@pukekohehigh.school.nz', classes: ['9TTEC'] }],
    classes: [{ code: '9TTEC', name: 'Year 9 Technology', projects: ['Photo Frame', 'Other project / task'] }]
  };

  const EMERGENCY_SETTINGS = {
    schemaVersion: 1,
    configVersion: 'built-in',
    school: { name: 'Pukekohe High School', shortName: 'PHS', faculty: 'Technology', appName: 'PHS Evidence Camera' },
    branding: { logo: 'phs-shield.png', themeColour: '#6e1818', backgroundColour: '#090a0c', accentColour: '#f2b632' },
    gateway: {
      url: 'https://script.google.com/macros/s/AKfycbyIGKMYC74b2kG42gYs4QlZvLdl1IbhZuvGn1pputswfHvGPupHOkKj0XISJrnY3sf4uA/exec',
      provider: 'apps-script',
      destinationLabel: 'the teacher evidence inbox'
    },
    image: { maxDimension: 2000, jpegQuality: 0.88, includeLogo: true, includeDateTime: true, includeStudentName: true, includeTeacher: true, includeClass: true, includeProject: true },
    features: { autoSendAfterStamp: true, allowUploadExistingPhoto: true, allowSaveCopy: true, allowInstallApp: true, rememberStudentName: true, showThemeButton: true },
    routing: { classFolderPattern: '{class}-{teacher}', studentFolderPattern: '{student}', filenamePattern: 'PHS_{student}_{project}_{timestamp}' },
    labels: { studentName: 'Student name', teacher: 'Teacher', class: 'Class', project: 'Project / task', takePhoto: 'Take Photo', send: 'Send', saveCopy: 'Save copy' }
  };

  function slugifyId(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }

  function getSchoolYear(date = new Date()) {
    return date.getFullYear();
  }

  function assertNonEmpty(value, label) {
    if (!String(value || '').trim()) throw new Error(`${label} is required.`);
  }

  function assertUnique(values, label) {
    const seen = new Set();
    for (const value of values) {
      const key = String(value).toLowerCase();
      if (seen.has(key)) throw new Error(`${label} collision: ${value}`);
      seen.add(key);
    }
  }

  function validateTeachingData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Teaching data root must be an object.');
    if (!Array.isArray(raw.teachers) || !Array.isArray(raw.classes)) throw new Error('Teaching data requires teachers and classes arrays.');

    const classIds = [];
    const classCodes = raw.classes.map((c) => {
      assertNonEmpty(c.code, 'Class code');
      assertNonEmpty(c.name, 'Class name');
      const classId = slugifyId(c.code);
      if (!classId) throw new Error(`Class ${c.code} produces an empty ID.`);
      classIds.push(classId);
      if (!Array.isArray(c.projects)) throw new Error(`Projects for ${c.code} must be an array.`);
      const generated = c.projects.map((p) => slugifyId(p));
      if (generated.some((x) => !x)) throw new Error(`A project in ${c.code} produces an empty ID.`);
      assertUnique(generated, `Project ID in ${c.code}`);
      return String(c.code).trim().toUpperCase();
    });
    assertUnique(classCodes, 'Class code');
    assertUnique(classIds, 'Class ID');

    const classSet = new Set(classCodes);
    const teacherIds = raw.teachers.map((t) => {
      assertNonEmpty(t.code, 'Teacher code');
      assertNonEmpty(t.name, 'Teacher name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t.email || ''))) throw new Error(`Teacher email is invalid for ${t.code}.`);
      if (!Array.isArray(t.classes)) throw new Error(`Classes for ${t.code} must be an array.`);
      for (const code of t.classes) {
        if (!classSet.has(String(code).trim().toUpperCase())) throw new Error(`Teacher ${t.code} references unknown class ${code}.`);
      }
      const id = slugifyId(t.code);
      if (!id) throw new Error(`Teacher ${t.code} produces an empty ID.`);
      return id;
    });
    assertUnique(teacherIds, 'Teacher code');
    return raw;
  }

  function validatePattern(pattern, label) {
    const text = String(pattern || '');
    const found = [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const token of found) {
      if (!APPROVED_TOKENS.has(token)) throw new Error(`${label} uses unsupported token {${token}}.`);
    }
    return text;
  }

  function validateAppSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('App settings root must be an object.');
    if (raw.schemaVersion !== 1) throw new Error('Unsupported app settings schemaVersion.');
    const url = String(raw.gateway?.url || '');
    if (raw.gateway?.provider === 'apps-script' && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:[?#].*)?$/.test(url)) {
      throw new Error('gateway.url must be a deployed Google Apps Script /exec URL.');
    }

    const quality = Number(raw.image?.jpegQuality);
    if (!(quality > 0 && quality <= 1)) throw new Error('image.jpegQuality must be > 0 and <= 1.');
    const maxDimension = Number(raw.image?.maxDimension);
    if (!(maxDimension >= 800 && maxDimension <= 6000)) throw new Error('image.maxDimension must be between 800 and 6000.');

    const imageBooleanKeys = ['includeLogo', 'includeDateTime', 'includeStudentName', 'includeTeacher', 'includeClass', 'includeProject'];
    for (const key of imageBooleanKeys) {
      if (raw.image?.[key] !== undefined && typeof raw.image[key] !== 'boolean') {
        throw new Error(`image.${key} must be a boolean.`);
      }
    }
    for (const [key, value] of Object.entries(raw.features || {})) {
      if (typeof value !== 'boolean') throw new Error(`features.${key} must be a boolean.`);
    }
    for (const [key, value] of Object.entries(raw.labels || {})) {
      if (typeof value !== 'string') throw new Error(`labels.${key} must be a string.`);
    }

    const supportedColour = /^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;
    for (const key of ['themeColour', 'backgroundColour', 'accentColour']) {
      const value = raw.branding?.[key];
      if (value !== undefined && (typeof value !== 'string' || !supportedColour.test(value.trim()))) {
        throw new Error(`branding.${key} must be a supported CSS colour.`);
      }
    }

    const routingFields = [
      ['classFolderPattern', raw.routing?.classFolderPattern],
      ['studentFolderPattern', raw.routing?.studentFolderPattern],
      ['filenamePattern', raw.routing?.filenamePattern]
    ];
    for (const [label, pattern] of routingFields) {
      assertNonEmpty(pattern, `routing.${label}`);
      validatePattern(pattern, label);
    }
    return raw;
  }

  function normaliseAppSettings(raw) {
    validateAppSettings(raw);
    return {
      ...EMERGENCY_SETTINGS,
      ...raw,
      school: { ...EMERGENCY_SETTINGS.school, ...(raw.school || {}) },
      branding: { ...EMERGENCY_SETTINGS.branding, ...(raw.branding || {}) },
      gateway: { ...EMERGENCY_SETTINGS.gateway, ...(raw.gateway || {}) },
      image: { ...EMERGENCY_SETTINGS.image, ...(raw.image || {}) },
      features: { ...EMERGENCY_SETTINGS.features, ...(raw.features || {}) },
      routing: { ...EMERGENCY_SETTINGS.routing, ...(raw.routing || {}) },
      labels: { ...EMERGENCY_SETTINGS.labels, ...(raw.labels || {}) }
    };
  }

  function normaliseTeachingData(raw) {
    validateTeachingData(raw);
    const classes = raw.classes.map((c) => ({
      id: slugifyId(c.code),
      code: String(c.code).trim().toUpperCase(),
      name: String(c.name).trim(),
      label: `${String(c.name).trim()} (${String(c.code).trim().toUpperCase()})`,
      projects: c.projects.map((name) => ({
        id: `${slugifyId(c.code)}_${slugifyId(name)}`,
        label: String(name).trim(),
        subjectId: slugifyId(c.code)
      }))
    }));
    const byCode = new Map(classes.map((c) => [c.code, c]));
    const teachers = raw.teachers.map((t) => ({
      id: slugifyId(t.code),
      code: String(t.code).trim().toUpperCase(),
      name: String(t.name).trim(),
      email: String(t.email).trim(),
      subjects: t.classes.map((code) => byCode.get(String(code).trim().toUpperCase()).id)
    }));
    return {
      configVersion: String(raw.configVersion || ''),
      teachers,
      classes,
      subjects: classes.map(({ id, code, name, label }) => ({ id, code, name, label })),
      projects: classes.flatMap((c) => c.projects)
    };
  }

  function resolvePattern(pattern, tokens) {
    validatePattern(pattern, 'Pattern');
    return String(pattern).replace(/\{([^}]+)\}/g, (_, token) => String(tokens[token] ?? ''));
  }

  function formatConfigStatus(status) {
    const version = status?.configVersion ? ` · ${status.configVersion}` : '';
    if (status?.source === 'network') return `Current${version}`;
    if (status?.source === 'last-known-good') return `Previous working copy${version}`;
    return `Emergency fallback${version}`;
  }

  function buildRoutingTokens(meta) {
    const createdAt = meta.createdAt || new Date().toISOString();
    let capturedDate = new Date(createdAt);
    if (!Number.isFinite(capturedDate.getTime())) capturedDate = new Date();
    const timestamp = createdAt
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .replace(/\..*$/, '')
      .replace(/[+Z].*$/, '');
    return {
      createdAt,
      capturedDate,
      tokens: {
        year: capturedDate.getFullYear(),
        teacher: meta.teacherCode,
        class: meta.classCode,
        student: meta.studentName,
        project: meta.projectLabel,
        timestamp
      }
    };
  }

  function safeFilename(value) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_ .]+|[_ .]+$/g, '');
  }

  function safeFolderValue(value) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .slice(0, 120);
  }

  function extensionForMime(mimeType) {
    return mimeType === 'image/png' ? 'png' : 'jpg';
  }

  function buildEvidenceFilename(meta, pattern, mimeType = 'image/jpeg') {
    const { tokens } = buildRoutingTokens(meta);
    const base = safeFilename(resolvePattern(pattern, tokens)) || 'PHS_Evidence';
    return `${base}.${extensionForMime(mimeType)}`;
  }

  function buildRoutingMeta(meta, routingSettings) {
    const { createdAt, capturedDate, tokens } = buildRoutingTokens(meta);
    return {
      routingVersion: 1,
      schoolYear: capturedDate.getFullYear(),
      teacherId: meta.teacherId,
      subjectId: meta.subjectId,
      projectId: meta.projectId,
      classKey: safeFolderValue(resolvePattern(routingSettings.classFolderPattern, tokens)),
      studentName: meta.studentName,
      studentFolder: safeFolderValue(resolvePattern(routingSettings.studentFolderPattern, tokens)) || 'Student',
      subjectLabel: meta.subjectLabel,
      projectLabel: meta.projectLabel,
      createdAt
    };
  }

  function chooseValidSelection(savedValue, validValues) {
    const values = Array.from(validValues || []);
    return values.includes(savedValue) ? savedValue : (values[0] || '');
  }

  async function defaultFetchJson(url) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response.json();
  }

  function readLkg(storage, key, validator) {
    try {
      const record = JSON.parse(storage.getItem(key) || 'null');
      if (!record?.data) return null;
      validator(record.data);
      return record;
    } catch (_) {
      return null;
    }
  }

  function writeLkg(storage, key, data, now) {
    try {
      storage.setItem(key, JSON.stringify({
        savedAt: now().toISOString(),
        configVersion: String(data.configVersion || ''),
        data
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadOne({ url, key, validator, storage, fetchJson, fallback, now }) {
    try {
      const remote = await fetchJson(url);
      validator(remote);
      writeLkg(storage, key, remote, now);
      return { data: remote, status: { source: 'network', configVersion: String(remote.configVersion || '') } };
    } catch (remoteError) {
      const lkg = readLkg(storage, key, validator);
      if (lkg) {
        return {
          data: lkg.data,
          status: {
            source: 'last-known-good',
            configVersion: String(lkg.configVersion || ''),
            error: String(remoteError.message || remoteError)
          }
        };
      }
      validator(fallback);
      return {
        data: fallback,
        status: {
          source: 'emergency-fallback',
          configVersion: String(fallback.configVersion || ''),
          error: String(remoteError.message || remoteError)
        }
      };
    }
  }

  async function loadConfiguration(options = {}) {
    const storage = options.storage || localStorage;
    const fetchJson = options.fetchJson || defaultFetchJson;
    const now = options.now || (() => new Date());
    const fallbacks = options.fallbacks || { teaching: EMERGENCY_TEACHING, settings: EMERGENCY_SETTINGS };

    const [settingsResult, teachingResult] = await Promise.all([
      loadOne({ url: './app-settings.json', key: SETTINGS_LKG_KEY, validator: validateAppSettings, storage, fetchJson, fallback: fallbacks.settings, now }),
      loadOne({ url: './teaching-data.json', key: TEACHING_LKG_KEY, validator: validateTeachingData, storage, fetchJson, fallback: fallbacks.teaching, now })
    ]);

    const teaching = normaliseTeachingData(teachingResult.data);
    const settings = normaliseAppSettings(settingsResult.data);
    return {
      settings,
      teaching,
      runtime: {
        schoolYear: getSchoolYear(now()),
        teachers: teaching.teachers,
        classes: teaching.classes,
        subjects: teaching.subjects,
        projects: teaching.projects
      },
      sourceStatus: { settings: settingsResult.status, teaching: teachingResult.status }
    };
  }

  return {
    slugifyId,
    getSchoolYear,
    validateTeachingData,
    validateAppSettings,
    normaliseAppSettings,
    normaliseTeachingData,
    resolvePattern,
    formatConfigStatus,
    buildRoutingMeta,
    buildEvidenceFilename,
    chooseValidSelection,
    loadConfiguration,
    SETTINGS_LKG_KEY,
    TEACHING_LKG_KEY
  };
});
