/**
 * FotoApuntes — escolar.js
 * Grupos y materias guardados en Firebase Firestore
 * Fotos en Cloudinary
 * Likes y comentarios en Firestore
 */

const CLOUDINARY_CLOUD = 'dwjzn6n0a';
const CLOUDINARY_PRESET = 'escolar_unsigned';
const ADMIN_PIN = '2309'; // ← cambia por tu PIN secreto

/* ════════════════════════════════════════════════════════
   ESTADO
════════════════════════════════════════════════════════ */
let GRUPOS = [];
let GALERIAS = [];
let currentGaleria = null;
let currentPhotoIndex = 0;
let likedPhotos = new Set(JSON.parse(localStorage.getItem('escolar_liked') || '[]'));
// Fotos donde ya no se puede retirar el like (una vez por dispositivo)
const LIKED_ONCE_KEY = 'escolar_liked_once';
let selectedFiles = [];
let commentListeners = {};
let currentCommentsId = null;
let pendingGroupId = null;
let selectedEmoji = '📚';
let selectedGroupEmoji = '📁';
let pinCallback = null;
let pinEntrado = '';
let currentView = 'groups';
let searchTerm = '';
let isPanning = false, startX = 0, startY = 0, panX = 0, panY = 0, startPX = 0, startPY = 0;
let currentZoom = 1;
const MIN_ZOOM = 1, MAX_ZOOM = 3, ZOOM_STEP = 0.25;

/* ════════════════════════════════════════════════════════
   FIREBASE — esperar a que esté listo
════════════════════════════════════════════════════════ */
function waitForFirebase(cb) {
  if (window._firestoreDb && window._firestoreLib) { cb(); return; }
  const t = setInterval(() => {
    if (window._firestoreDb && window._firestoreLib) { clearInterval(t); cb(); }
  }, 100);
}

function getDB() { return window._firestoreDb; }
function getLib() { return window._firestoreLib; }

/* ════════════════════════════════════════════════════════
   FIRESTORE — Grupos
════════════════════════════════════════════════════════ */
function escucharGrupos() {
  const { collection, onSnapshot, query, orderBy } = getLib();
  const q = query(collection(getDB(), 'fa_grupos'), orderBy('createdAt', 'asc'));
  onSnapshot(q, snap => {
    GRUPOS = [];
    snap.forEach(d => GRUPOS.push({ id: d.id, ...d.data() }));
    renderTodo();
  });
}

async function crearGrupo(name, icon) {
  const { collection, addDoc, serverTimestamp } = getLib();
  await addDoc(collection(getDB(), 'fa_grupos'), {
    name, icon, coverImage: '', createdAt: serverTimestamp()
  });
}

async function eliminarGrupoFirebase(id) {
  const { doc, deleteDoc, collection, getDocs, query, where, updateDoc } = getLib();
  const db = getDB();
  try {
    // Quitar groupId de materias que pertenecen a este grupo
    const q = query(collection(db, 'fa_galerias'), where('groupId', '==', id));
    const snap = await getDocs(q);
    const promesas = [];
    snap.forEach(d => promesas.push(updateDoc(d.ref, { groupId: '' })));
    await Promise.all(promesas);
    await deleteDoc(doc(db, 'fa_grupos', id));
    console.log('Grupo eliminado:', id);
  } catch (e) {
    console.error('Error eliminando grupo:', e);
    alert('Error al eliminar: ' + e.message);
  }
}

function toggleGrupoOpen(id, open) {
  if (open) openGroupIds.add(id);
  else openGroupIds.delete(id);
  saveOpenGroupsState();
}

function loadOpenGroupsState() {
  try {
    const raw = localStorage.getItem(GROUPS_OPEN_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    openGroupIds = new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_) {
    openGroupIds = new Set();
  }
}

function saveOpenGroupsState() {
  localStorage.setItem(GROUPS_OPEN_STORAGE_KEY, JSON.stringify([...openGroupIds]));
}

function isGroupOpen(groupId) {
  if (openGroupIds.size === 0 && !localStorage.getItem(GROUPS_OPEN_STORAGE_KEY)) return false;
  return openGroupIds.has(groupId);
}

function resetOpenGroupsState() {
  openGroupIds = new Set();
  localStorage.removeItem(GROUPS_OPEN_STORAGE_KEY);
}

/* ════════════════════════════════════════════════════════
   FIRESTORE — Galerías (materias)
════════════════════════════════════════════════════════ */
function escucharGalerias() {
  const { collection, onSnapshot, query, orderBy } = getLib();
  const q = query(collection(getDB(), 'fa_galerias'), orderBy('createdAt', 'asc'));
  onSnapshot(q, snap => {
    GALERIAS = [];
    snap.forEach(d => GALERIAS.push({ id: d.id, ...d.data(), photos: [] }));
    renderTodo();
  });
}

async function crearGaleria(name, icon, cloudinaryTag, groupId) {
  const { collection, addDoc, serverTimestamp } = getLib();
  await addDoc(collection(getDB(), 'fa_galerias'), {
    name, icon, cloudinaryTag, groupId, coverImage: '', createdAt: serverTimestamp()
  });
}

async function eliminarGaleriaFirebase(id) {
  const { doc, deleteDoc } = getLib();
  try {
    await deleteDoc(doc(getDB(), 'fa_galerias', id));
    console.log('Materia eliminada:', id);
  } catch (e) {
    console.error('Error eliminando materia:', e);
    alert('Error al eliminar: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════
   DOM
════════════════════════════════════════════════════════ */
const albumsSection = document.getElementById('albumsSection');
const sectionTitle = document.querySelector('.section-title');
const groupsContainer = document.getElementById('groupsContainer');
const emptyState = document.getElementById('emptyState');
const gallerySection = document.getElementById('gallerySection');
const galleryTitle = document.getElementById('galleryTitle');
const photosGrid = document.getElementById('photosGrid');
const btnBack = document.getElementById('btnBack');
const btnUploadTop = document.getElementById('btnUploadTop');
const uploadZone = document.getElementById('uploadZone');
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const uploadCaption = document.getElementById('uploadCaption');
const btnUploadSend = document.getElementById('btnUploadSend');
const uploadPreviewList = document.getElementById('uploadPreviewList');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const commentsModal = document.getElementById('commentsModal');
const commentsClose = document.getElementById('commentsClose');
const commentsTitleEl = document.getElementById('commentsTitleEl');
const commentsList = document.getElementById('commentsList');
const commentsForm = document.getElementById('commentsForm');
const commentsAuthor = document.getElementById('commentsAuthor');
const commentsText = document.getElementById('commentsText');
const newGroupModal = document.getElementById('newGroupModal');
const newGroupClose = document.getElementById('newGroupClose');
const newGroupCancel = document.getElementById('newGroupCancel');
const newGroupConfirm = document.getElementById('newGroupConfirm');
const groupNameInput = document.getElementById('groupNameInput');
const groupEmojiPicker = document.getElementById('groupEmojiPicker');
const newGalleryModal = document.getElementById('newGalleryModal');
const newGalleryClose = document.getElementById('newGalleryClose');
const newGalleryCancel = document.getElementById('newGalleryCancel');
const newGalleryConfirm = document.getElementById('newGalleryConfirm');
const galleryName = document.getElementById('galleryName');
const galleryTag = document.getElementById('galleryTag');
const galleryGroupSelect = document.getElementById('galleryGroupSelect');
const emojiPicker = document.getElementById('emojiPicker');
const btnNewGroup = document.getElementById('btnNewGroup');
const btnNewGallery = document.getElementById('btnNewGallery');
const pinModal = document.getElementById('pinModal');
const pinDotsContainer = document.getElementById('pinDotsContainer');
const pinError = document.getElementById('pinError');
const pinCancelBtn = document.getElementById('pinCancelBtn');
const btnInstallApp = document.getElementById('btnInstallApp');
const btnThemeToggle = document.getElementById('btnThemeToggle');
const btnViewGroups = document.getElementById('btnViewGroups');
const btnViewSubjects = document.getElementById('btnViewSubjects');
const globalSearch = document.getElementById('globalSearch');
const subjectCommentsModal = document.getElementById('subjectCommentsModal');
const subjectCommentsClose = document.getElementById('subjectCommentsClose');
const subjectCommentsTitle = document.getElementById('subjectCommentsTitle');
const subjectCommentsList = document.getElementById('subjectCommentsList');
const subjectCommentsForm = document.getElementById('subjectCommentsForm');
const subjectCommentsAuthor = document.getElementById('subjectCommentsAuthor');
const subjectCommentsText = document.getElementById('subjectCommentsText');

let deferredInstallPrompt = null;
let currentSubjectCommentsId = null;
let subjectCommentsUnsub = null;
const GROUPS_OPEN_STORAGE_KEY = 'escolar_open_groups';
const SUBJECT_NOTES_AUTHOR_STORAGE_KEY = 'escolar_subject_notes_author';
let openGroupIds = new Set();

/* ════════════════════════════════════════════════════════
   EMOJIS
════════════════════════════════════════════════════════ */
const EMOJIS_MATERIA = [
'📚', '📐', '🧮', '🔬', '🌍', '💾', '📖', '✏️', '💡', '🧠', 
'📊', '🎨', '🏃', '🎶', '💻', '📝', '🌿', '⭐', '🧬', '🏛️',
'⌨️', '🤖', '🌐', '📡', '🔢', '🧪', '⚖️', '🗣️', '🗺️', '🎭',
'🛠️', '🔌', '🔋', '🏗️', '🖨️', '✒️', '🔍', '🪐', '🕰️', '🌋'
];
const EMOJIS_GRUPO = [
'📁', '🗂️', '📦', '🎓', '📅', '🏫', '⭐', '🌟', '📌', '🧱', 
'🗓️', '🌈', '🎯', '🏆', '💼', '📂', '🔌', '📑', '📡', '💾', 
'✅', '⏳', '🚀', '☁️', '🔗', '🏢', '🖇️', '🔔', '📢', '💡', 
'📍', '🚩', '🗄️', '🥇', '💯', '💻', '⌨️', '🖱️', '🖥️', '🖨️'

];

function renderEmojiPickerEn(container, emojis, current, onSelect) {
  container.innerHTML = emojis.map(e =>
    `<button type="button" class="emoji-opt ${e === current ? 'selected' : ''}" data-emoji="${e}">${e}</button>`
  ).join('');
  container.querySelectorAll('.emoji-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(btn.dataset.emoji);
    });
  });
}

/* ════════════════════════════════════════════════════════
   PIN
════════════════════════════════════════════════════════ */
function pedirPin(mensaje, callback) {
  pinEntrado = ''; pinCallback = callback;
  pinError.textContent = '';
  document.getElementById('pinMensaje').textContent = mensaje;
  actualizarPuntos();
  pinModal.classList.add('open');
}
function cerrarPinModal() {
  pinModal.classList.remove('open');
  pinEntrado = '';
  pinCallback = null;
  pinError.textContent = '';
  actualizarPuntos();
}
function actualizarPuntos() {
  pinDotsContainer.querySelectorAll('.pin-dot').forEach((d, i) =>
    d.classList.toggle('filled', i < pinEntrado.length));
}
function presionarTecla(val) {
  if (val === 'del') { pinEntrado = pinEntrado.slice(0, -1); actualizarPuntos(); return; }
  if (pinEntrado.length >= ADMIN_PIN.length) return;
  pinEntrado += val;
  actualizarPuntos();
  if (pinEntrado.length === ADMIN_PIN.length) {
    setTimeout(() => {
      if (pinEntrado === ADMIN_PIN) {
        const callback = pinCallback;
        cerrarPinModal();
        if (typeof callback === 'function') callback();
      }
      else { pinError.textContent = '❌ PIN incorrecto.'; pinEntrado = ''; actualizarPuntos(); }
    }, 200);
  }
}
function initPinModal() {
  document.querySelectorAll('.pin-key').forEach(btn =>
    btn.addEventListener('click', () => presionarTecla(btn.dataset.val)));
  pinCancelBtn.addEventListener('click', cerrarPinModal);
  pinModal.addEventListener('click', e => { if (e.target === pinModal) cerrarPinModal(); });
}

/* ════════════════════════════════════════════════════════
   RENDER PRINCIPAL
════════════════════════════════════════════════════════ */
function renderTodo() {
  const search = searchTerm.trim().toLowerCase();
  groupsContainer.classList.toggle('subjects-list', currentView === 'subjects');
  if (!GRUPOS.length && !GALERIAS.length) {
    emptyState.style.display = 'block';
    groupsContainer.innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';
  let html = '';

  if (currentView === 'groups') {
    GRUPOS.forEach(grupo => {
      const materias = GALERIAS.filter(g => g.groupId === grupo.id);
      const groupMatches = !search || (grupo.name || '').toLowerCase().includes(search);
      const subjectMatches = materias.some(m => (m.name || '').toLowerCase().includes(search));
      if (search && !groupMatches && !subjectMatches) return;
      const isOpen = isGroupOpen(grupo.id);
      const primeraCover = grupo.coverImage || materias.find(m => m.coverImage)?.coverImage || '';
      html += `
      <div class="group-accordion ${isOpen ? 'open' : ''}" data-group-id="${grupo.id}">
        <div class="group-header" data-group-id="${grupo.id}">
          <div class="group-card-top">
            ${primeraCover ? `<div class="group-header-bg" style="background-image:url('${primeraCover}')"></div>` : ''}
            <span class="group-icon">${grupo.icon}</span>
          </div>
          <div class="group-card-info">
            <span class="group-name">${escHtml(grupo.name)}</span>
            <span class="group-count">${materias.length} ${materias.length === 1 ? 'materia' : 'materias'}</span>
          </div>
          <div class="group-mini-actions">
            <button class="group-mini-btn" data-open-group="${grupo.id}" title="Abrir grupo">Abrir</button>
            <button class="group-mini-btn primary" data-group-notes="${grupo.id}" data-group-name="${escHtml(grupo.name)}" title="Notas del grupo">Notas</button>
          </div>
          <button class="group-delete" data-group-id="${grupo.id}" title="Eliminar grupo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
          <svg class="group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
        <div class="group-body">
          <div class="carousel-wrap">
            <div class="albums-carousel">
              ${materias.length === 0
        ? `<p class="carousel-empty">Sin materias aún.</p>`
        : materias.map(m => albumCardHTML(m)).join('')}
            </div>
          </div>
          <button class="btn-add-to-group" data-group-id="${grupo.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Agregar materia aquí
          </button>
        </div>
      </div>`;
    });
  } else {
    const materiasFiltradas = GALERIAS.filter(g => !search || (g.name || '').toLowerCase().includes(search));
    html = `<div class="ungrouped-section">
      <div class="carousel-wrap">
        <div class="albums-carousel">
          ${materiasFiltradas.length ? materiasFiltradas.map(m => albumCardHTML(m)).join('') : '<p class="carousel-empty">No hay materias con ese nombre.</p>'}
        </div>
      </div>
    </div>`;
  }

  const sinGrupo = GALERIAS.filter(g =>
    (!g.groupId || !GRUPOS.find(gr => gr.id === g.groupId)) &&
    (!search || (g.name || '').toLowerCase().includes(search)));
  if (currentView === 'groups' && sinGrupo.length > 0) {
    html += `<div class="ungrouped-section">
      <p class="ungrouped-title">Sin grupo</p>
      <div class="carousel-wrap">
        <div class="albums-carousel">${sinGrupo.map(m => albumCardHTML(m)).join('')}</div>
      </div>
    </div>`;
  }

  groupsContainer.innerHTML = html;
  attachGroupEvents();
  cargarConteosDeFotos();
}

function albumCardHTML(g) {
  const notesTitle = `Notas de ${escHtml(g.name)}`;
  return `
    <div class="album-card-wrap">
      <article class="album-card" data-id="${g.id}" tabindex="0">
        <div class="album-cover">
          ${g.coverImage
      ? `<img src="${g.coverImage}" alt="${escHtml(g.name)}" loading="lazy"
                 onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
      : ''}
          <span class="album-icon" style="${g.coverImage ? 'display:none' : ''}">${g.icon}</span>
        </div>
        <div class="album-info">
          <h3 class="album-name">${escHtml(g.name)}</h3>
          <p class="album-count" id="count-${g.id}">…</p>
          <p class="album-tag">#${escHtml(g.cloudinaryTag)}</p>
        </div>
        <div class="album-actions">
          <button class="album-action-btn" data-open-materia="${g.id}">Abrir</button>
          <button class="album-action-btn primary" data-open-subject-notes="${g.id}" data-notes-title="${notesTitle}">Notas</button>
        </div>
      </article>
      <button class="materia-delete" data-id="${g.id}" title="Eliminar materia">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
        Eliminar
      </button>
    </div>`;
}

function attachGroupEvents() {
  groupsContainer.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.group-delete') || e.target.closest('.group-mini-btn')) return;
      const acc = header.closest('.group-accordion');
      const id = acc.dataset.groupId;
      acc.classList.toggle('open');
      const isOpen = acc.classList.contains('open');
      toggleGrupoOpen(id, isOpen);
    });
  });

  groupsContainer.querySelectorAll('.group-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.groupId;
      const grupo = GRUPOS.find(g => g.id === id);
      pedirPin(`Eliminar grupo "${grupo?.name}"`, async () => {
        await eliminarGrupoFirebase(id);
      });
    });
  });

  // Long press en móvil para mostrar botones de eliminar
  groupsContainer.querySelectorAll('.group-header').forEach(header => {
    let pressTimer;
    header.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => {
        header.classList.add('show-delete');
        setTimeout(() => header.classList.remove('show-delete'), 3000);
      }, 800);
    });
    header.addEventListener('touchend', () => clearTimeout(pressTimer));
    header.addEventListener('touchmove', () => clearTimeout(pressTimer));
  });

  groupsContainer.querySelectorAll('.materia-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const materia = GALERIAS.find(g => g.id === id);
      pedirPin(`Eliminar materia "${materia?.name}"`, async () => {
        await eliminarGaleriaFirebase(id);
      });
    });
  });

  // Long press en tarjeta para mostrar eliminar en móvil
  groupsContainer.querySelectorAll('.album-card-wrap').forEach(wrap => {
    let pressTimer;
    wrap.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => {
        wrap.classList.add('show-delete');
        setTimeout(() => wrap.classList.remove('show-delete'), 3000);
      }, 800);
    });
    wrap.addEventListener('touchend', () => clearTimeout(pressTimer));
    wrap.addEventListener('touchmove', () => clearTimeout(pressTimer));
  });

  groupsContainer.querySelectorAll('.album-card').forEach(card => {
    const open = () => openGaleria(card.dataset.id);
    card.addEventListener('click', e => {
      if (e.target.closest('.album-action-btn') || e.target.closest('.materia-delete')) return;
      open();
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  groupsContainer.querySelectorAll('[data-open-materia]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openGaleria(btn.dataset.openMateria);
    });
  });
  groupsContainer.querySelectorAll('[data-open-subject-notes]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openSubjectComments(btn.dataset.openSubjectNotes, btn.dataset.notesTitle || 'Notas de materia');
    });
  });

  groupsContainer.querySelectorAll('.btn-add-to-group').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingGroupId = btn.dataset.groupId;
      openNewGalleryModal(pendingGroupId);
    });
  });
  groupsContainer.querySelectorAll('[data-open-group]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.openGroup;
      const acc = groupsContainer.querySelector(`.group-accordion[data-group-id="${id}"]`);
      if (!acc) return;
      acc.classList.add('open');
      toggleGrupoOpen(id, true);
    });
  });
  groupsContainer.querySelectorAll('[data-group-notes]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const groupId = btn.dataset.groupNotes;
      const groupName = btn.dataset.groupName || 'Grupo';
      openSubjectComments(`group_${groupId}`, `Notas del grupo: ${groupName}`);
    });
  });
}

/* ════════════════════════════════════════════════════════
   CLOUDINARY — cargar fotos
════════════════════════════════════════════════════════ */
async function cargarFotosDeGaleria(galeria) {
  const { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc } = getLib();

  try {
    const q = query(
      collection(getDB(), 'fa_fotos'),
      where('galeriaId', '==', galeria.id)
    );

    const snap = await Promise.race([
      getDocs(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);

    galeria.photos = [];
    snap.forEach(d => {
      const data = d.data();
      galeria.photos.push({
        src:         data.src,
        caption:     data.caption || '',
        id:          d.id,
        firestoreId: d.id,
        publicId:    data.publicId || '',
        createdAt:   data.createdAt?.toMillis?.() || 0,
      });
    });
    galeria.photos.sort((a, b) => b.createdAt - a.createdAt);

    // Si Firestore está vacío, buscar en Cloudinary y migrar automáticamente
    if (galeria.photos.length === 0 && galeria.cloudinaryTag) {
      const fotosCloud = await fetchFotosCloudinary(galeria.cloudinaryTag);
      if (fotosCloud.length > 0) {
        for (const p of fotosCloud) {
          try {
            const ref = await addDoc(collection(getDB(), 'fa_fotos'), {
              src:       p.src,
              publicId:  p.publicId,
              galeriaId: galeria.id,
              caption:   p.caption,
              createdAt: serverTimestamp(),
            });
            galeria.photos.push({ ...p, firestoreId: ref.id, id: ref.id, createdAt: Date.now() });
          } catch (_) {
            // Si falla guardar en Firestore, igual mostrar la foto
            galeria.photos.push(p);
          }
        }
      }
    }

    // Actualizar portada si no tiene
    if (!galeria.coverImage && galeria.photos.length > 0) {
      await updateDoc(doc(getDB(), 'fa_galerias', galeria.id), { coverImage: galeria.photos[0].src });
      galeria.coverImage = galeria.photos[0].src;
    }
  } catch (e) {
    console.error('Error cargando fotos:', e);
    galeria.photos = galeria.photos || [];
  }
}

// Leer fotos de Cloudinary con timeout de 6 segundos
async function fetchFotosCloudinary(tag) {
  try {
    const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/list/${tag}.json`;
    const r = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ]);
    if (!r.ok) return [];
    const data = await r.json();
    if (!data.resources?.length) return [];
    return data.resources.map(f => ({
      src:         `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/v${f.version}/${f.public_id}.${f.format}`,
      caption:     f.context?.custom?.caption || '',
      id:          f.public_id.replace(/\//g, '_'),
      publicId:    f.public_id,
      firestoreId: '',
      createdAt:   0,
    }));
  } catch (_) {
    return [];
  }
}

async function cargarConteosDeFotos() {
  for (const g of GALERIAS) {
    cargarFotosDeGaleria(g).then(() => {
      const el = document.getElementById('count-' + g.id);
      if (el) el.textContent = `${g.photos?.length || 0} ${g.photos?.length === 1 ? 'foto' : 'fotos'}`;
    });
  }
}

/* ════════════════════════════════════════════════════════
   ABRIR / CERRAR GALERÍA
════════════════════════════════════════════════════════ */
async function openGaleria(id) {
  currentGaleria = GALERIAS.find(g => g.id === id);
  if (!currentGaleria) return;
  galleryTitle.textContent = currentGaleria.icon + '  ' + currentGaleria.name;
  photosGrid.innerHTML = '<p style="color:var(--brown-light);padding:1rem">Cargando fotos…</p>';
  albumsSection.classList.add('hidden');
  gallerySection.classList.add('visible');
  gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  uploadZone.classList.remove('open');
  await cargarFotosDeGaleria(currentGaleria);
  renderPhotos();
}

function closeGaleria() {
  albumsSection.classList.remove('hidden');
  gallerySection.classList.remove('visible');
  uploadZone.classList.remove('open');
  currentGaleria = null;
  selectedFiles = [];
  uploadPreviewList.innerHTML = '';
  btnUploadSend.disabled = true;
}

/* ════════════════════════════════════════════════════════
   RENDER FOTOS
════════════════════════════════════════════════════════ */
function renderPhotos() {
  const photos = currentGaleria?.photos || [];
  const likedOnce = new Set(JSON.parse(localStorage.getItem(LIKED_ONCE_KEY) || '[]'));
  if (photos.length === 0) {
    photosGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--brown-light)">
        <div style="font-size:2.5rem;margin-bottom:.5rem">📷</div>
        <p>Aún no hay fotos.<br>Sube la primera con el botón de arriba.</p>
      </div>`;
    return;
  }
  photosGrid.innerHTML = photos.map((p, i) => {
    const safeId = String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const alreadyLiked = likedOnce.has(safeId);
    return `
    <div class="photo-item" data-index="${i}">
      <div class="photo-img-wrap">
        <img src="${p.src}" alt="${escHtml(p.caption)}" loading="lazy">
        ${p.caption ? `<div class="photo-caption-text">${escHtml(p.caption)}</div>` : ''}
      </div>
      <div class="photo-actions">
        <button class="btn-like ${alreadyLiked ? 'liked liked-once' : ''}" data-id="${p.id}" title="${alreadyLiked ? 'Ya diste like' : 'Dar like'}">
          <span class="heart">${alreadyLiked ? '❤️' : '🤍'}</span>
          <span class="like-count" id="likes-${p.id}">0</span>
        </button>
        <button class="btn-comments" data-src="${p.src}" data-caption="${escHtml(p.caption)}">💬 Notas</button>
        <button class="btn-set-cover" data-src="${p.src}" title="Usar como portada de materia y grupo" aria-label="Usar como portada">⭐</button>
        <button class="btn-delete-photo" data-firestoreid="${p.firestoreId}" data-publicid="${p.publicId || ''}" data-src="${p.src}" title="Eliminar foto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');

  photosGrid.querySelectorAll('.photo-img-wrap img').forEach((img, i) =>
    img.addEventListener('click', () => openLightbox(i)));
  photosGrid.querySelectorAll('.btn-like').forEach(btn => {
    const handler = () => toggleLike(btn.dataset.id, btn);
    btn.addEventListener('click', handler);
    // Soporte táctil explícito para móvil/tablet
    btn.addEventListener('touchend', e => { e.preventDefault(); handler(); });
    loadLikes(btn.dataset.id);
  });
  photosGrid.querySelectorAll('.btn-comments').forEach(btn =>
    btn.addEventListener('click', () => openComments(btn.dataset.src, btn.dataset.caption)));
  photosGrid.querySelectorAll('.btn-set-cover').forEach(btn =>
    btn.addEventListener('click', () => establecerPortadaMateria(btn.dataset.src)));
  photosGrid.querySelectorAll('.btn-delete-photo').forEach(btn => {
    btn.addEventListener('click', () => {
      pedirPin('Eliminar esta foto', async () => {
        await eliminarFoto(btn.dataset.firestoreid, btn.dataset.publicid, btn.dataset.src);
      });
    });
  });
}

/* ════════════════════════════════════════════════════════
   ELIMINAR FOTO — Cloudinary (vía Netlify) + Firestore
════════════════════════════════════════════════════════ */
async function eliminarFoto(firestoreId, publicId, src) {
  if (!firestoreId) {
    alert('No se puede eliminar: ID de foto no encontrado.');
    return;
  }
  // Borrar metadatos de Firestore
  // (la foto en Cloudinary queda, se puede limpiar manualmente desde el panel de Cloudinary)
  const { doc, deleteDoc } = getLib();
  try {
    await deleteDoc(doc(getDB(), 'fa_fotos', firestoreId));
  } catch (err) {
    console.error('Error al borrar de Firestore:', err);
    alert('Error al eliminar: ' + err.message);
    return;
  }
  // Actualizar estado local
  if (currentGaleria?.photos) {
    currentGaleria.photos = currentGaleria.photos.filter(p => p.firestoreId !== firestoreId);
  }
  if (currentGaleria && currentGaleria.coverImage === src) {
    const siguiente = currentGaleria.photos[0]?.src || '';
    await establecerPortadaMateria(siguiente, true);
  }
  renderPhotos();
}

/* ════════════════════════════════════════════════════════
   SUBIDA DE FOTOS
════════════════════════════════════════════════════════ */
btnUploadTop.addEventListener('click', () => uploadZone.classList.toggle('open'));
dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
dropArea.addEventListener('drop', e => { e.preventDefault(); dropArea.classList.remove('dragover'); addFiles([...e.dataTransfer.files]); });
dropArea.addEventListener('click', e => { if (!e.target.closest('label')) fileInput.click(); });
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));
cameraInput.addEventListener('change', () => addFiles([...cameraInput.files]));

function addFiles(files) {
  selectedFiles = [...selectedFiles, ...files.filter(f => f.type.startsWith('image/'))];
  uploadPreviewList.innerHTML = '';
  selectedFiles.forEach(f => {
    const img = document.createElement('img');
    img.className = 'upload-thumb';
    img.src = URL.createObjectURL(f);
    uploadPreviewList.appendChild(img);
  });
  btnUploadSend.disabled = selectedFiles.length === 0;
}

btnUploadSend.addEventListener('click', async () => {
  if (!selectedFiles.length || !currentGaleria) return;
  const caption = uploadCaption.value.trim();
  const total = selectedFiles.length;
  let subidas = 0;
  uploadProgress.style.display = 'block';
  btnUploadSend.disabled = true;

  for (const file of selectedFiles) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('tags', currentGaleria.cloudinaryTag);
    fd.append('folder', `FotoApuntes/${currentGaleria.cloudinaryTag}`);
    
    // 👇 ESTA ES LA ÚNICA LÍNEA NUEVA QUE AGREGA LA SUBCARPETA VISUAL 👇
    fd.append('asset_folder', `FotoApuntes/${currentGaleria.cloudinaryTag}`);
    
    if (caption) fd.append('context', `caption=${caption}`);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      // Guardar foto en Firestore (para poder eliminarla sin Netlify)
      const { collection, addDoc, serverTimestamp, doc, updateDoc } = getLib();
      await addDoc(collection(getDB(), 'fa_fotos'), {
        src:       data.secure_url,
        publicId:  data.public_id,
        galeriaId: currentGaleria.id,
        caption:   caption || '',
        createdAt: serverTimestamp(),
      });

      subidas++;
      uploadProgressBar.style.width = Math.round((subidas / total) * 100) + '%';
      uploadProgressText.textContent = `Subiendo ${subidas} de ${total}…`;
      // Actualizar coverImage si es la primera foto
      if (subidas === 1 && !currentGaleria.coverImage) {
        await updateDoc(doc(getDB(), 'fa_galerias', currentGaleria.id), { coverImage: data.secure_url });
      }
    } catch (err) {
      uploadProgressText.textContent = `Error: ${err.message}`;
    }
  }

  uploadProgressText.textContent = `✅ ${subidas} de ${total} fotos subidas.`;
  setTimeout(async () => {
    uploadProgress.style.display = 'none';
    uploadProgressBar.style.width = '0%';
    selectedFiles = [];
    uploadPreviewList.innerHTML = '';
    uploadCaption.value = '';
    fileInput.value = '';
    btnUploadSend.disabled = true;
    await cargarFotosDeGaleria(currentGaleria);
    renderPhotos();
  }, 1800);
});

/* ════════════════════════════════════════════════════════
   LIGHTBOX
════════════════════════════════════════════════════════ */
function openLightbox(index) {
  const photos = currentGaleria?.photos || [];
  if (!photos[index]) return;
  currentPhotoIndex = index;
  const p = photos[index];
  lightboxImg.src = p.src; lightboxImg.alt = p.caption || '';
  lightboxCaption.textContent = p.caption || '';
  currentZoom = 1; panX = 0; panY = 0; applyZoom();
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() { lightbox.classList.remove('active'); document.body.style.overflow = ''; }
function showPhoto(index) {
  const len = currentGaleria?.photos?.length || 0;
  currentPhotoIndex = (index + len) % len;
  const p = currentGaleria.photos[currentPhotoIndex];
  lightboxImg.src = p.src; lightboxImg.alt = p.caption || '';
  lightboxCaption.textContent = p.caption || '';
  currentZoom = 1; panX = 0; panY = 0; applyZoom();
}
function applyZoom() {
  lightboxImg.style.transform = `translate(${panX}px,${panY}px) scale(${currentZoom})`;
  lightboxImg.style.cursor = currentZoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default';
}
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => showPhoto(currentPhotoIndex - 1));
lightboxNext.addEventListener('click', () => showPhoto(currentPhotoIndex + 1));
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showPhoto(currentPhotoIndex - 1);
  if (e.key === 'ArrowRight') showPhoto(currentPhotoIndex + 1);
});
lightboxImg.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = lightboxImg.getBoundingClientRect();
  const ox = e.clientX - (rect.left + rect.width / 2);
  const oy = e.clientY - (rect.top + rect.height / 2);
  const dir = e.deltaY < 0 ? 1 : -1;
  const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom + dir * ZOOM_STEP));
  if (nz !== currentZoom) { const f = nz / currentZoom; panX = panX * f + ox * (1 - f); panY = panY * f + oy * (1 - f); currentZoom = nz; }
  applyZoom();
});
lightboxImg.addEventListener('dblclick', () => { currentZoom = 1; panX = 0; panY = 0; applyZoom(); });

// Doble tap para zoom en móvil
let lastTap = 0;
lightboxImg.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 300) {
    e.preventDefault();
    if (currentZoom > 1) { currentZoom = 1; panX = 0; panY = 0; }
    else { currentZoom = 2; }
    applyZoom();
  }
  lastTap = now;
});
lightboxImg.addEventListener('mousedown', e => { if (currentZoom > 1) { isPanning = true; startX = e.clientX; startY = e.clientY; startPX = panX; startPY = panY; } });
window.addEventListener('mousemove', e => { if (!isPanning) return; panX = startPX + (e.clientX - startX); panY = startPY + (e.clientY - startY); applyZoom(); });
window.addEventListener('mouseup', () => { isPanning = false; });

/* ════════════════════════════════════════════════════════
   LIKES
════════════════════════════════════════════════════════ */
async function loadLikes(photoId) {
  if (!window._firestoreDb) return;
  const safeId = String(photoId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const { doc, getDoc } = getLib();
  try {
    const snap = await getDoc(doc(getDB(), 'escolar_likes', 'p_' + safeId));
    const el = document.getElementById('likes-' + photoId);
    if (el) el.textContent = snap.exists() ? (snap.data().likes || 0) : 0;
  } catch (e) { }
}
async function toggleLike(photoId, btn) {
  if (!window._firestoreDb) { console.warn('Firebase no listo'); return; }
  // Normalizar el id para evitar problemas con caracteres especiales
  const safeId = String(photoId).replace(/[^a-zA-Z0-9_-]/g, '_');
  // Verificar si este dispositivo ya dio like a esta foto
  let likedOnce;
  try { likedOnce = new Set(JSON.parse(localStorage.getItem(LIKED_ONCE_KEY) || '[]')); }
  catch (_) { likedOnce = new Set(); }

  if (likedOnce.has(safeId)) {
    btn.classList.add('like-pulse');
    setTimeout(() => btn.classList.remove('like-pulse'), 600);
    return;
  }
  const { doc, setDoc, increment } = getLib();
  try {
    await setDoc(doc(getDB(), 'escolar_likes', 'p_' + safeId), { likes: increment(1) }, { merge: true });
    likedOnce.add(safeId);
    localStorage.setItem(LIKED_ONCE_KEY, JSON.stringify([...likedOnce]));
    likedPhotos.add(photoId);
    localStorage.setItem('escolar_liked', JSON.stringify([...likedPhotos]));
    btn.querySelector('.heart').textContent = '❤️';
    btn.classList.add('liked', 'liked-once');
    btn.title = 'Ya diste like';
    await loadLikes(safeId);
  } catch (e) { console.error('Error al dar like:', e); }
}

/* ════════════════════════════════════════════════════════
   COMENTARIOS
════════════════════════════════════════════════════════ */
function openComments(photoSrc, caption) {
  currentCommentsId = btoa(photoSrc).replace(/\//g, '_');
  commentsTitleEl.textContent = caption ? `Notas · ${caption}` : 'Notas del apunte';
  commentsList.innerHTML = '<p class="no-comments">Cargando…</p>';
  commentsModal.classList.add('open');
  listenComments(currentCommentsId);
}
function closeCommentsModal() {
  commentsModal.classList.remove('open');
  if (commentListeners[currentCommentsId]) { commentListeners[currentCommentsId](); delete commentListeners[currentCommentsId]; }
  currentCommentsId = null;
}
function listenComments(photoId) {
  if (!window._firestoreDb) { commentsList.innerHTML = '<p class="no-comments">Firebase no conectado.</p>'; return; }
  const { collection, query, where, onSnapshot } = getLib();
  if (commentListeners[photoId]) commentListeners[photoId]();
  const q = query(collection(getDB(), 'escolar_comments'), where('photoId', '==', photoId));
  commentListeners[photoId] = onSnapshot(q, snap => {
    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    commentsList.innerHTML = docs.length === 0
      ? '<p class="no-comments">Sin notas aún.</p>'
      : docs.map(d => `
          <div class="comment-item">
            <div class="comment-top-row">
              <div class="comment-author">${escHtml(d.author || 'Yo')}</div>
              <button class="btn-delete-comment" data-comment-id="${d.id}" title="Eliminar nota">🗑️</button>
            </div>
            <div class="comment-text">${escHtml(d.text || '')}</div>
            <div class="comment-date">${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('es-MX') : ''}</div>
          </div>`).join('');
    commentsList.scrollTop = commentsList.scrollHeight;
    commentsList.querySelectorAll('.btn-delete-comment').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = btn.dataset.commentId;
        pedirPin('Eliminar esta nota', async () => {
          await eliminarComentarioFirebase(commentId);
        });
      });
    });
  });
}

async function eliminarComentarioFirebase(commentId) {
  if (!window._firestoreDb) return;
  const { doc, deleteDoc } = getLib();
  try {
    await deleteDoc(doc(getDB(), 'escolar_comments', commentId));
  } catch (err) {
    alert('No se pudo eliminar la nota.');
  }
}
commentsClose.addEventListener('click', closeCommentsModal);
commentsModal.addEventListener('click', e => { if (e.target === commentsModal) closeCommentsModal(); });
commentsForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!window._firestoreDb || !currentCommentsId) return;
  const { collection, addDoc, serverTimestamp } = getLib();
  const author = commentsAuthor.value.trim();
  const text = commentsText.value.trim();
  if (!author) { alert('Escribe tu nombre para guardar la nota.'); commentsAuthor.focus(); return; }
  if (!text) return;
  try {
    await addDoc(collection(getDB(), 'escolar_comments'), { photoId: currentCommentsId, author, text, createdAt: serverTimestamp() });
    commentsText.value = '';
  } catch (err) { alert('No se pudo guardar la nota.'); }
});

/* ════════════════════════════════════════════════════════
   COMENTARIOS DE MATERIA / GRUPO (VISTA CRISTAL)
════════════════════════════════════════════════════════ */
function openSubjectComments(subjectId, title) {
  if (!subjectCommentsModal) return;
  currentSubjectCommentsId = subjectId;
  const isGroupNotes = String(subjectId || '').startsWith('group_');
  if (subjectCommentsTitle) subjectCommentsTitle.textContent = title || 'Notas de materia';
  if (subjectCommentsText) {
    subjectCommentsText.placeholder = isGroupNotes
      ? 'Escribe una nota para este grupo...'
      : 'Escribe una nota para esta materia...';
  }
  if (subjectCommentsAuthor && !subjectCommentsAuthor.value) {
    subjectCommentsAuthor.value = localStorage.getItem(SUBJECT_NOTES_AUTHOR_STORAGE_KEY) || '';
  }
  subjectCommentsList.innerHTML = '<p class="no-comments">Cargando…</p>';
  subjectCommentsModal.classList.add('open');
  listenSubjectComments(subjectId);
}

function closeSubjectCommentsModal() {
  if (!subjectCommentsModal) return;
  subjectCommentsModal.classList.remove('open');
  if (subjectCommentsUnsub) { subjectCommentsUnsub(); subjectCommentsUnsub = null; }
  currentSubjectCommentsId = null;
}

function listenSubjectComments(subjectId) {
  if (!window._firestoreDb) {
    subjectCommentsList.innerHTML = '<p class="no-comments">Firebase no conectado.</p>';
    return;
  }
  const { collection, query, where, onSnapshot, doc, deleteDoc } = getLib();
  if (subjectCommentsUnsub) subjectCommentsUnsub();
  const q = query(collection(getDB(), 'escolar_subject_comments'), where('subjectId', '==', subjectId));
  subjectCommentsUnsub = onSnapshot(q, snap => {
    const docs = [];
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    subjectCommentsList.innerHTML = docs.length === 0
      ? '<p class="no-comments">Sin notas aún.</p>'
      : docs.map(d => `
          <div class="comment-item">
            <div class="comment-top-row">
              <div class="comment-author">${escHtml(d.author || 'Yo')}</div>
              <button class="btn-delete-comment" data-subject-comment-id="${d.id}">🗑️</button>
            </div>
            <div class="comment-text">${escHtml(d.text || '')}</div>
            <div class="comment-date">${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('es-MX') : ''}</div>
          </div>`).join('');
    subjectCommentsList.querySelectorAll('[data-subject-comment-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = btn.dataset.subjectCommentId;
        pedirPin('Eliminar nota de materia', async () => {
          await deleteDoc(doc(getDB(), 'escolar_subject_comments', commentId));
        });
      });
    });
  });
}

if (subjectCommentsClose) subjectCommentsClose.addEventListener('click', closeSubjectCommentsModal);
if (subjectCommentsModal) {
  subjectCommentsModal.addEventListener('click', e => {
    if (e.target === subjectCommentsModal) closeSubjectCommentsModal();
  });
}
if (subjectCommentsForm) {
  subjectCommentsForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!window._firestoreDb || !currentSubjectCommentsId) return;
    const { collection, addDoc, serverTimestamp } = getLib();
    const author = subjectCommentsAuthor.value.trim();
    const text = subjectCommentsText.value.trim();
    if (!author) { alert('Escribe tu nombre para guardar la nota.'); subjectCommentsAuthor.focus(); return; }
    if (!text) return;
    try {
      localStorage.setItem(SUBJECT_NOTES_AUTHOR_STORAGE_KEY, author);
      await addDoc(collection(getDB(), 'escolar_subject_comments'), {
        subjectId: currentSubjectCommentsId, author, text, createdAt: serverTimestamp()
      });
      subjectCommentsText.value = '';
    } catch (_) {
      alert('No se pudo guardar la nota.');
    }
  });
}

async function establecerPortadaMateria(src, silent = false) {
  if (!currentGaleria) return;
  const { doc, updateDoc } = getLib();
  try {
    await updateDoc(doc(getDB(), 'fa_galerias', currentGaleria.id), { coverImage: src || '' });
    currentGaleria.coverImage = src || '';
    if (currentGaleria.groupId) {
      await updateDoc(doc(getDB(), 'fa_grupos', currentGaleria.groupId), { coverImage: src || '' });
      const grupo = GRUPOS.find(g => g.id === currentGaleria.groupId);
      if (grupo) grupo.coverImage = src || '';
    }
    if (!silent) alert('Portada de materia actualizada.');
    renderTodo();
  } catch (err) {
    if (!silent) alert('No se pudo actualizar la portada.');
  }
}

/* ════════════════════════════════════════════════════════
   MODAL: NUEVO GRUPO
════════════════════════════════════════════════════════ */
function openNewGroupModal() {
  groupNameInput.value = '';
  selectedGroupEmoji = EMOJIS_GRUPO[0];
  renderEmojiPickerEn(groupEmojiPicker, EMOJIS_GRUPO, selectedGroupEmoji, e => selectedGroupEmoji = e);
  newGroupModal.classList.add('open');
  groupNameInput.focus();
}
function closeNewGroupModal() { newGroupModal.classList.remove('open'); }

btnNewGroup.addEventListener('click', openNewGroupModal);
newGroupClose.addEventListener('click', closeNewGroupModal);
newGroupCancel.addEventListener('click', closeNewGroupModal);
newGroupModal.addEventListener('click', e => { if (e.target === newGroupModal) closeNewGroupModal(); });
newGroupConfirm.addEventListener('click', async () => {
  const name = groupNameInput.value.trim();
  if (!name) { alert('Escribe el nombre del grupo.'); return; }
  closeNewGroupModal();
  await crearGrupo(name, selectedGroupEmoji);
});

/* ════════════════════════════════════════════════════════
   MODAL: NUEVA MATERIA
════════════════════════════════════════════════════════ */
function openNewGalleryModal(preGroupId) {
  galleryName.value = '';
  galleryTag.value = '';
  selectedEmoji = EMOJIS_MATERIA[0];
  renderEmojiPickerEn(emojiPicker, EMOJIS_MATERIA, selectedEmoji, e => selectedEmoji = e);
  galleryGroupSelect.innerHTML =
    `<option value="">Sin grupo</option>` +
    GRUPOS.map(g => `<option value="${g.id}" ${g.id === preGroupId ? 'selected' : ''}>${g.icon} ${escHtml(g.name)}</option>`).join('');
  newGalleryModal.classList.add('open');
  galleryName.focus();
}
function closeNewGalleryModal() { newGalleryModal.classList.remove('open'); pendingGroupId = null; }

btnNewGallery.addEventListener('click', () => openNewGalleryModal(''));
newGalleryClose.addEventListener('click', closeNewGalleryModal);
newGalleryCancel.addEventListener('click', closeNewGalleryModal);
newGalleryModal.addEventListener('click', e => { if (e.target === newGalleryModal) closeNewGalleryModal(); });

galleryName.addEventListener('input', () => {
  const val = galleryName.value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  galleryTag.value = val;
});

newGalleryConfirm.addEventListener('click', async () => {
  const name = galleryName.value.trim();
  const tag = galleryTag.value.trim().replace(/\s+/g, '_');
  const groupId = galleryGroupSelect.value;
  if (!name || !tag) { alert('Por favor llena el nombre y el tag.'); return; }
  closeNewGalleryModal();
  await crearGaleria(name, selectedEmoji, tag, groupId);
});

/* ════════════════════════════════════════════════════════
   NAVEGACIÓN
════════════════════════════════════════════════════════ */
btnBack.addEventListener('click', closeGaleria);

/* ════════════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════════════════════
   FILTROS + TEMA
════════════════════════════════════════════════════════ */
function updateViewButtons() {
  if (btnViewGroups) btnViewGroups.classList.toggle('active', currentView === 'groups');
  if (btnViewSubjects) btnViewSubjects.classList.toggle('active', currentView === 'subjects');
  if (sectionTitle) sectionTitle.textContent = currentView === 'groups' ? 'Mis Grupos' : 'Mis Materias';
}

function initThemeToggle() {
  const storedTheme = localStorage.getItem('escolar_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Si no hay preferencia guardada, seguir el sistema
  const activeTheme = storedTheme || (prefersDark ? 'dark' : 'light');
  document.body.setAttribute('data-theme', activeTheme);
  if (btnThemeToggle) btnThemeToggle.textContent = activeTheme === 'dark' ? '☀️' : '🌙';

  // Escuchar cambios del sistema en tiempo real (si no hay preferencia manual)
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('escolar_theme')) {
        const next = e.matches ? 'dark' : 'light';
        document.body.setAttribute('data-theme', next);
        if (btnThemeToggle) btnThemeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
      }
    });
  }

  if (!btnThemeToggle) return;
  btnThemeToggle.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('escolar_theme', next);
    btnThemeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

function initFilters() {
  updateViewButtons();
  if (btnViewGroups) {
    btnViewGroups.addEventListener('click', () => {
      currentView = 'groups';
      updateViewButtons();
      renderTodo();
    });
  }
  if (btnViewSubjects) {
    btnViewSubjects.addEventListener('click', () => {
      currentView = 'subjects';
      updateViewButtons();
      renderTodo();
    });
  }
  if (globalSearch) {
    globalSearch.addEventListener('input', () => {
      searchTerm = globalSearch.value || '';
      renderTodo();
    });
  }
}

/* ════════════════════════════════════════════════════════
   ARRANQUE — esperar Firebase y escuchar colecciones
════════════════════════════════════════════════════════ */
initPinModal();
initThemeToggle();
initFilters();
resetOpenGroupsState();
waitForFirebase(() => {
  escucharGrupos();
  escucharGalerias();
});

window.addEventListener('beforeunload', () => {
  resetOpenGroupsState();
});

/* ════════════════════════════════════════════════════════
   PWA / INSTALAR APP
════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (btnInstallApp) btnInstallApp.hidden = false;
});

if (btnInstallApp) {
  btnInstallApp.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      alert('Si no aparece el botón de instalar en la barra, abre el menú del navegador y elige "Instalar app" o "Agregar a pantalla de inicio".');
      return;
    }
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (_) {}
    deferredInstallPrompt = null;
    btnInstallApp.hidden = true;
  });
}

window.addEventListener('load', () => {
  // Fallback para que siempre exista una opcion visible de instalacion.
  if (btnInstallApp) btnInstallApp.hidden = false;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (btnInstallApp) btnInstallApp.hidden = true;
});
