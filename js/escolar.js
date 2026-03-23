/**
 * FotoApuntes — escolar.js
 * Grupos y materias guardados en Firebase Firestore
 * Fotos en Cloudinary
 * Likes y comentarios en Firestore
 */

const CLOUDINARY_CLOUD = 'dwjzn6n0a';
const CLOUDINARY_PRESET = 'escolar_unsigned';
const DELETE_FUNCTION_URL = 'https://gilded-kataifi-894a8b.netlify.app/.netlify/functions/delete-photo';
const ADMIN_PIN = '1234'; // ← cambia por tu PIN secreto

/* ════════════════════════════════════════════════════════
   ESTADO
════════════════════════════════════════════════════════ */
let GRUPOS = [];
let GALERIAS = [];
let currentGaleria = null;
let currentPhotoIndex = 0;
let likedPhotos = new Set(JSON.parse(localStorage.getItem('escolar_liked') || '[]'));
let selectedFiles = [];
let commentListeners = {};
let currentCommentsId = null;
let pendingGroupId = null;
let selectedEmoji = '📚';
let selectedGroupEmoji = '📁';
let pinCallback = null;
let pinEntrado = '';
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
    name, icon, open: true, createdAt: serverTimestamp()
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

async function toggleGrupoOpen(id, open) {
  const { doc, updateDoc } = getLib();
  await updateDoc(doc(getDB(), 'fa_grupos', id), { open });
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

/* ════════════════════════════════════════════════════════
   EMOJIS
════════════════════════════════════════════════════════ */
const EMOJIS_MATERIA = ['📚', '📐', '🧮', '🔬', '🌍', '⚗️', '📖', '✏️', '💡', '🧠', '📊', '🎨', '🏃', '🎶', '💻', '📝', '🌿', '⭐', '🧬', '🏛️'];
const EMOJIS_GRUPO = ['📁', '🗂️', '📦', '🎓', '📅', '🏫', '⭐', '🌟', '📌', '🔖', '🗓️', '🌈', '🎯', '🏆', '💼'];

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
  pinEntrado = ''; pinCallback = null;
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
      if (pinEntrado === ADMIN_PIN) { cerrarPinModal(); if (pinCallback) pinCallback(); }
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
  if (!GRUPOS.length && !GALERIAS.length) {
    emptyState.style.display = 'block';
    groupsContainer.innerHTML = '';
    return;
  }
  emptyState.style.display = 'none';
  let html = '';

  GRUPOS.forEach(grupo => {
    const materias = GALERIAS.filter(g => g.groupId === grupo.id);
    const isOpen = grupo.open !== false;
    // Buscar imagen de portada del primer álbum del grupo
    const primeraCover = materias.find(m => m.coverImage)?.coverImage || '';
    html += `
      <div class="group-accordion ${isOpen ? 'open' : ''}" data-group-id="${grupo.id}">
        <div class="group-header" data-group-id="${grupo.id}">
          ${primeraCover ? `<div class="group-header-bg" style="background-image:url('${primeraCover}')"></div>` : ''}
          <span class="group-icon">${grupo.icon}</span>
          <span class="group-name">${escHtml(grupo.name)}</span>
          <span class="group-count">${materias.length} ${materias.length === 1 ? 'materia' : 'materias'}</span>
          <button class="group-delete" data-group-id="${grupo.id}" title="Mantén presionado para eliminar">
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

  const sinGrupo = GALERIAS.filter(g => !g.groupId || !GRUPOS.find(gr => gr.id === g.groupId));
  if (sinGrupo.length > 0) {
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
      if (e.target.closest('.group-delete')) return;
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
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  groupsContainer.querySelectorAll('.btn-add-to-group').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingGroupId = btn.dataset.groupId;
      openNewGalleryModal(pendingGroupId);
    });
  });
}

/* ════════════════════════════════════════════════════════
   CLOUDINARY — cargar fotos
════════════════════════════════════════════════════════ */
async function cargarFotosDeGaleria(galeria) {
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/list/${galeria.cloudinaryTag}.json`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.resources || data.resources.length === 0) { galeria.photos = []; return; }
    galeria.photos = data.resources.map(f => ({
      src: `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/v${f.version}/${f.public_id}.${f.format}`,
      caption: f.context?.custom?.caption || '',
      id: f.public_id.replace(/\//g, '_'),
      publicId: f.public_id,
    }));
    // Actualizar coverImage en Firestore si no tiene
    if (!galeria.coverImage && galeria.photos.length > 0) {
      const { doc, updateDoc } = getLib();
      await updateDoc(doc(getDB(), 'fa_galerias', galeria.id), { coverImage: galeria.photos[0].src });
      galeria.coverImage = galeria.photos[0].src;
    }
  } catch (e) {
    galeria.photos = galeria.photos || [];
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
  if (photos.length === 0) {
    photosGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--brown-light)">
        <div style="font-size:2.5rem;margin-bottom:.5rem">📷</div>
        <p>Aún no hay fotos.<br>Sube la primera con el botón de arriba.</p>
      </div>`;
    return;
  }
  photosGrid.innerHTML = photos.map((p, i) => `
    <div class="photo-item" data-index="${i}">
      <div class="photo-img-wrap">
        <img src="${p.src}" alt="${escHtml(p.caption)}" loading="lazy">
        ${p.caption ? `<div class="photo-caption-text">${escHtml(p.caption)}</div>` : ''}
      </div>
      <div class="photo-actions">
        <button class="btn-like ${likedPhotos.has(p.id) ? 'liked' : ''}" data-id="${p.id}">
          <span class="heart">${likedPhotos.has(p.id) ? '❤️' : '🤍'}</span>
          <span class="like-count" id="likes-${p.id}">0</span>
        </button>
        <button class="btn-comments" data-src="${p.src}" data-caption="${escHtml(p.caption)}">
          💬 ${p.caption ? escHtml(p.caption.length > 12 ? p.caption.slice(0, 12) + '…' : p.caption) : 'Notas'}
        </button>
        <button class="btn-delete-photo" data-publicid="${p.publicId}" data-src="${p.src}" title="Eliminar foto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>`).join('');

  photosGrid.querySelectorAll('.photo-img-wrap img').forEach((img, i) =>
    img.addEventListener('click', () => openLightbox(i)));
  photosGrid.querySelectorAll('.btn-like').forEach(btn => {
    btn.addEventListener('click', () => toggleLike(btn.dataset.id, btn));
    loadLikes(btn.dataset.id);
  });
  photosGrid.querySelectorAll('.btn-comments').forEach(btn =>
    btn.addEventListener('click', () => openComments(btn.dataset.src, btn.dataset.caption)));
  photosGrid.querySelectorAll('.btn-delete-photo').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm("¿Seguro que quieres eliminar esta foto?")) {
        eliminarFoto(btn.dataset.publicid, btn.dataset.src);
      }
    });
  });
}

/* ════════════════════════════════════════════════════════
   ELIMINAR FOTO (DIRECTO A CLOUDINARY - CON RASTREADORES)
════════════════════════════════════════════════════════ */
async function eliminarFoto(publicId, src) {
  console.log("1. Iniciando eliminación para la foto:", publicId);

  const btn = photosGrid.querySelector(`[data-publicid="${publicId}"]`);
  if (btn) btn.textContent = '⏳';

  const cloudName = 'dwjzn6n0a';
  const apiKey = '658928118369874';
  const apiSecret = 'wyCuV2e8I9co9Ur2dq1K2hAx_N4';

  const timestamp = Math.round(new Date().getTime() / 1000);
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  console.log("2. Todo listo para firmar seguridad");

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log("3. Firma matemática generada");

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', timestamp);
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    console.log("4. Enviando la orden de destruir a Cloudinary...");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData
    });

    const dataRes = await res.json();
    console.log("5. Respuesta exacta de Cloudinary:", dataRes);

    if (!res.ok || dataRes.result !== 'ok') {
      throw new Error(dataRes.error?.message || `Cloudinary devolvió: ${dataRes.result}`);
    }

    console.log("6. ¡Éxito! Borrando la foto de la pantalla...");
    if (currentGaleria?.photos) {
      currentGaleria.photos = currentGaleria.photos.filter(p => p.src !== src);
    }

    if (currentGaleria && currentGaleria.coverImage === src) {
      const newCover = currentGaleria.photos[0]?.src || '';
      const { doc, updateDoc } = getLib();
      await updateDoc(doc(getDB(), 'fa_galerias', currentGaleria.id), { coverImage: newCover });
    }

    renderPhotos();
    alert("¡Foto eliminada correctamente!");

  } catch (err) {
    console.error('7. ERROR DETECTADO:', err);
    alert('Fallo al eliminar. Revisa la consola. Detalle: ' + err.message);
    renderPhotos();
  }
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
    if (caption) fd.append('context', `caption=${caption}`);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      subidas++;
      uploadProgressBar.style.width = Math.round((subidas / total) * 100) + '%';
      uploadProgressText.textContent = `Subiendo ${subidas} de ${total}…`;
      // Actualizar coverImage si es la primera foto
      if (subidas === 1 && !currentGaleria.coverImage) {
        const { doc, updateDoc } = getLib();
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
lightboxImg.addEventListener('mousedown', e => { if (currentZoom > 1) { isPanning = true; startX = e.clientX; startY = e.clientY; startPX = panX; startPY = panY; } });
window.addEventListener('mousemove', e => { if (!isPanning) return; panX = startPX + (e.clientX - startX); panY = startPY + (e.clientY - startY); applyZoom(); });
window.addEventListener('mouseup', () => { isPanning = false; });

/* ════════════════════════════════════════════════════════
   LIKES
════════════════════════════════════════════════════════ */
async function loadLikes(photoId) {
  if (!window._firestoreDb) return;
  const { doc, getDoc } = getLib();
  try {
    const snap = await getDoc(doc(getDB(), 'escolar_likes', 'p_' + photoId));
    const el = document.getElementById('likes-' + photoId);
    if (el) el.textContent = snap.exists() ? (snap.data().likes || 0) : 0;
  } catch (e) { }
}
async function toggleLike(photoId, btn) {
  if (!window._firestoreDb) return;
  const { doc, setDoc, increment } = getLib();
  const already = likedPhotos.has(photoId);
  try {
    await setDoc(doc(getDB(), 'escolar_likes', 'p_' + photoId), { likes: increment(already ? -1 : 1) }, { merge: true });
    already ? likedPhotos.delete(photoId) : likedPhotos.add(photoId);
    localStorage.setItem('escolar_liked', JSON.stringify([...likedPhotos]));
    btn.querySelector('.heart').textContent = likedPhotos.has(photoId) ? '❤️' : '🤍';
    btn.classList.toggle('liked', likedPhotos.has(photoId));
    await loadLikes(photoId);
  } catch (e) { console.error(e); }
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
    snap.forEach(d => docs.push(d.data()));
    docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    commentsList.innerHTML = docs.length === 0
      ? '<p class="no-comments">Sin notas aún.</p>'
      : docs.map(d => `
          <div class="comment-item">
            <div class="comment-author">${escHtml(d.author || 'Yo')}</div>
            <div class="comment-text">${escHtml(d.text || '')}</div>
            <div class="comment-date">${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('es-MX') : ''}</div>
          </div>`).join('');
    commentsList.scrollTop = commentsList.scrollHeight;
  });
}
commentsClose.addEventListener('click', closeCommentsModal);
commentsModal.addEventListener('click', e => { if (e.target === commentsModal) closeCommentsModal(); });
commentsForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!window._firestoreDb || !currentCommentsId) return;
  const { collection, addDoc, serverTimestamp } = getLib();
  const author = commentsAuthor.value.trim() || 'Yo';
  const text = commentsText.value.trim();
  if (!text) return;
  try {
    await addDoc(collection(getDB(), 'escolar_comments'), { photoId: currentCommentsId, author, text, createdAt: serverTimestamp() });
    commentsText.value = '';
  } catch (err) { alert('No se pudo guardar la nota.'); }
});

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
  if (!galleryTag.value) {
    galleryTag.value = galleryName.value
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }
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
   ARRANQUE — esperar Firebase y escuchar colecciones
════════════════════════════════════════════════════════ */
initPinModal();
waitForFirebase(() => {
  escucharGrupos();
  escucharGalerias();
});
