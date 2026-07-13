// Three.js globals
let scene, camera, renderer, controls, currentModel;

function initViewer() {
  const container = document.getElementById('viewer');
  // Ensure layout is computed before reading dimensions
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.5, 3);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Lights — strong enough to illuminate models clearly
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
  backLight.position.set(-5, 5, -5);
  scene.add(backLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(0, -5, 5);
  scene.add(fillLight);

  // Grid
  const grid = new THREE.GridHelper(10, 20, 0x444466, 0x333355);
  scene.add(grid);

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.5, 0);
  controls.update();

  // Animate
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Resize
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

function loadModel(url) {
  const loader = new THREE.GLTFLoader();

  // Remove previous model
  if (currentModel) {
    scene.remove(currentModel);
  }

  loader.load(
    url,
    (gltf) => {
      currentModel = gltf.scene;

      // Auto-center and scale
      const box = new THREE.Box3().setFromObject(currentModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      currentModel.scale.setScalar(scale);

      // Recompute bounding box after scaling for correct centering
      const scaledBox = new THREE.Box3().setFromObject(currentModel);
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
      // Center horizontally, place bottom on ground plane
      currentModel.position.x -= scaledCenter.x;
      currentModel.position.z -= scaledCenter.z;
      currentModel.position.y -= scaledBox.min.y;

      scene.add(currentModel);

      // Reset camera to look at model center
      const finalBox = new THREE.Box3().setFromObject(currentModel);
      const finalCenter = finalBox.getCenter(new THREE.Vector3());
      const finalSize = finalBox.getSize(new THREE.Vector3());
      controls.target.copy(finalCenter);
      camera.position.set(finalCenter.x, finalCenter.y + 0.5, finalCenter.z + finalSize.length() * 1.2);
      controls.update();
    },
    undefined,
    (error) => {
      console.error('Model load error:', error);
      setStatus('模型加载失败: ' + error.message);
    }
  );
}

// UI helpers
function setStatus(text) {
  document.getElementById('statusText').textContent = text;
}

function setProgress(pct) {
  document.getElementById('progressBar').style.width = pct + '%';
}

function showStatusPanel() {
  document.getElementById('statusPanel').style.display = 'block';
  setProgress(0);
}

function showViewer() {
  const panel = document.getElementById('viewerPanel');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    // Delay init to ensure the browser has laid out the panel
    requestAnimationFrame(() => {
      initViewer();
      // Force correct size after layout
      const container = document.getElementById('viewer');
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (renderer && w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
  }
}

function setButtons(disabled) {
  document.getElementById('textBtn').disabled = disabled;
  document.getElementById('imageBtn').disabled = disabled;
  document.getElementById('textToImageBtn').disabled = disabled;
}

// Polling
let pollTimer = null;

function startPolling(taskId) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/task/${taskId}`);
      const data = await res.json();

      if (!res.ok) {
        clearInterval(pollTimer);
        setStatus('查询失败: ' + (data.error || '未知错误'));
        setButtons(false);
        return;
      }

      setProgress(data.progress || 0);

      switch (data.status) {
        case 'SUCCEEDED':
          clearInterval(pollTimer);
          setStatus('生成完成！');
          setProgress(100);
          setButtons(false);

          if (data.task_type === 'text-to-image' && data.image_urls && data.image_urls.length > 0) {
            // Show generated images
            const previewPanel = document.getElementById('imagePreviewPanel');
            const previewContainer = document.getElementById('imagePreview');
            previewPanel.style.display = 'block';
            previewContainer.innerHTML = '';
            data.image_urls.forEach((url, i) => {
              const img = document.createElement('img');
              img.src = url;
              img.alt = '生成的图片 ' + (i + 1);
              img.style.cssText = 'max-width:100%;margin:8px 0;border-radius:8px;';
              previewContainer.appendChild(img);
            });
            const imgDl = document.getElementById('imageDownloadLink');
            imgDl.href = data.image_urls[0];
            imgDl.download = 'generated-image.png';
            imgDl.style.display = 'inline-block';
          } else if (data.model_urls && data.model_urls.glb) {
            const proxyUrl = '/api/proxy-model?url=' + encodeURIComponent(data.model_urls.glb);
            showViewer();
            loadModel(proxyUrl);

            const dl = document.getElementById('downloadLink');
            dl.href = proxyUrl;
            dl.download = 'model.glb';
            dl.style.display = 'inline-block';
          }
          break;

        case 'FAILED':
        case 'EXPIRED':
          clearInterval(pollTimer);
          setStatus('任务失败，请重试');
          setButtons(false);
          break;

        case 'PENDING':
          setStatus('排队中... (' + (data.progress || 0) + '%)');
          break;

        case 'IN_PROGRESS':
          setStatus('生成中... (' + (data.progress || 0) + '%)');
          break;

        default:
          setStatus('状态: ' + data.status + ' (' + (data.progress || 0) + '%)');
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, 3000);
}

// Generate from text
async function generateFromText() {
  const description = document.getElementById('textInput').value.trim();
  if (!description) {
    alert('请输入描述文字');
    return;
  }

  setButtons(true);
  showStatusPanel();
  setStatus('正在优化提示词...');
  document.getElementById('promptText').textContent = '';

  try {
    const res = await fetch('/api/generate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus('创建任务失败: ' + (data.error || '未知错误'));
      setButtons(false);
      return;
    }

    if (data.optimizedPrompt) {
      document.getElementById('promptText').textContent = '优化后的提示词: ' + data.optimizedPrompt;
    }

    setStatus('任务已创建，等待处理...');
    startPolling(data.taskId);
  } catch (err) {
    setStatus('请求失败: ' + err.message);
    setButtons(false);
  }
}

// Generate image from text
async function generateTextToImage() {
  const prompt = document.getElementById('textToImageInput').value.trim();
  if (!prompt) {
    alert('请输入图片描述');
    return;
  }

  const aiModel = document.getElementById('imageModel').value;
  const aspectRatio = document.getElementById('imageAspectRatio').value;

  setButtons(true);
  showStatusPanel();
  setStatus('正在优化提示词...');
  document.getElementById('promptText').textContent = '';
  // Hide previous image preview
  document.getElementById('imagePreviewPanel').style.display = 'none';

  try {
    const res = await fetch('/api/generate-text-to-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ai_model: aiModel, aspect_ratio: aspectRatio }),
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus('创建任务失败: ' + (data.error || '未知错误'));
      setButtons(false);
      return;
    }

    if (data.optimizedPrompt) {
      document.getElementById('promptText').textContent = '优化后的提示词: ' + data.optimizedPrompt;
    }

    setStatus('任务已创建，等待处理...');
    startPolling(data.taskId);
  } catch (err) {
    setStatus('请求失败: ' + err.message);
    setButtons(false);
  }
}

// Generate from image
async function generateFromImage() {
  const fileInput = document.getElementById('imageInput');
  if (!fileInput.files || !fileInput.files[0]) {
    alert('请先选择图片');
    return;
  }

  setButtons(true);
  showStatusPanel();
  setStatus('正在上传图片...');
  document.getElementById('promptText').textContent = '';

  try {
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);

    const res = await fetch('/api/generate-image', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus('创建任务失败: ' + (data.error || '未知错误'));
      setButtons(false);
      return;
    }

    setStatus('任务已创建，等待处理...');
    startPolling(data.taskId);
  } catch (err) {
    setStatus('请求失败: ' + err.message);
    setButtons(false);
  }
}
