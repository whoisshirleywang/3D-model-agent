// Three.js globals
let scene, camera, renderer, controls, currentModel;

function initViewer() {
  const container = document.getElementById('viewer');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.5, 3);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
  backLight.position.set(-5, 5, -5);
  scene.add(backLight);

  // Grid
  const grid = new THREE.GridHelper(10, 20, 0x333333, 0x222222);
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
      currentModel.position.sub(center.multiplyScalar(scale));
      currentModel.position.y += size.y * scale / 2;

      scene.add(currentModel);

      // Reset camera
      controls.target.set(0, size.y * scale / 2, 0);
      camera.position.set(0, size.y * scale / 2 + 1, 3);
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
    initViewer();
  }
}

function setButtons(disabled) {
  document.getElementById('textBtn').disabled = disabled;
  document.getElementById('imageBtn').disabled = disabled;
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

          if (data.model_urls && data.model_urls.glb) {
            showViewer();
            loadModel(data.model_urls.glb);

            const dl = document.getElementById('downloadLink');
            dl.href = data.model_urls.glb;
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
