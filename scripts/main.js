import * as THREE from 'three';
/*将文件中的所有模块导入包装到THREE这一个类中*/
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRealisticTerrain } from './terrainGenerator.js';


// const 只保证变量存的地址不变，但是内容还是可以修改的
//1. 场景 
const scene = new THREE.Scene();
const fogColor = 0xcccccc; 
scene.background = new THREE.Color(fogColor);
scene.fog = new THREE.FogExp2(fogColor, 0.0005);// FogExp2 是指数雾，比线性雾更真实，参数 0.0005 是雾的浓度


//1.5 灯光 (新增) 
// 环境光：均匀照亮所有物体，模拟天空的散射光
const ambientLight = new THREE.AmbientLight(0xffffff, 1); 
scene.add(ambientLight);

// 平行光：模拟太阳，产生阴影和亮面
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(50, 100, 50); // 太阳位置拉高，照亮整个岛
scene.add(dirLight);

// --- 添加圆形海平面 (Water Helper) ---
const waterGeometry = new THREE.CircleGeometry(2000, 64); // 半径1000，分段64
const waterMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3366ff, 
    transparent: false, 
    opacity: 0.6,
    roughness: 0.1
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.rotation.x = -Math.PI / 2;
water.position.y = -224 ; // 海平面高度
scene.add(water);




//2. 相机
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 80, 150); 
camera.lookAt(0, 80, 0);

//3. 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; 
document.body.appendChild(renderer.domElement);

//4. 添加控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // 阻尼
controls.dampingFactor = 0.05; // 阻尼系数
controls.autoRotate = true;    
controls.autoRotateSpeed = 0.2;

controls.maxPolarAngle = Math.PI / 2 - 0.05; 
controls.minDistance = 20;
controls.maxDistance = 400;



//5. 生成地形
const loadingScreen = document.getElementById('loading-screen');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const errorText = document.getElementById('error-text');

function updateProgress(message, percentage) {
    if (statusText) statusText.innerText = message;
    if (progressBar) progressBar.style.width = percentage + '%';
}

createRealisticTerrain(scene, updateProgress).then((terrainMesh) => {
    // Hide loading screen on success
    
    // 隐藏标题 "Generating Terrain..."
    const loadingTitle = document.querySelector('#loading-screen h2');
    if (loadingTitle) {
        loadingTitle.style.display = 'none';
    }

    if (statusText) {
        statusText.innerText = "Generation Complete";
        statusText.style.color = '#4CAF50';
    }
    if (progressBar) {
        // Optional: Hide the bar or keep it full
        progressBar.style.width = '100%';
        progressBar.parentElement.style.display = 'none'; // Hide the progress bar container
    }
    // We do NOT hide the loadingScreen container itself, so the text "Generation Complete" remains visible in bottom right.
    // However, if we want to auto-hide it after a while, we can.
    // User requested: "加载完成就在右下角显示complete並顯示地形就行" -> "Display Complete in bottom right and show terrain".
    
    // Ensure terrain is visible (it is added to scene inside createRealisticTerrain now)
    // Adjust y position if needed, previous code had terrainMesh.position.y = -30 commented out.
    // The generator produces terrain centered at y=0 roughly but peaks go up.
    
    // Let's fade out the "Complete" message after a longer delay if desired, or keep it.
    // User instruction implies leaving it there or just showing "Complete". 
    // I will leave it visible as requested.
    
}).catch(err => {
    // Show error on loading screen
    if (statusText) statusText.innerText = "Error Occurred!";
    if (progressBar) progressBar.style.backgroundColor = 'red';
    if (errorText) {
        errorText.style.display = 'block';
        
        let msg = "Unknown Error";
        if (err && err.message) {
            msg = err.message;
        } else if (err && err instanceof Event) {
            msg = "Failed to load Worker script (404 Not Found or Parse Error). check console for details.";
        } else if (typeof err === 'string') {
            msg = err;
        }

        errorText.innerText = msg + "\n\nCheck console (F12) for more details.";
    }
    console.error("Critical Error in Terrain Generation:", err);
});
// terrainMesh.position.y = -30;


//6. 动画循环 
function animate() {
    //告诉浏览提，animate这个函数需要按照一定频率循环调用
    requestAnimationFrame(animate);

    controls.update(); // 必须调用，否则阻尼和自动旋转无效

    renderer.render(scene, camera);
}
animate();

//7. 自适应窗口
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});