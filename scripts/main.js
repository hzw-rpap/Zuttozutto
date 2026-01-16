import * as THREE from 'three';
/*将文件中的所有模块导入包装到THREE这一个类中*/
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRealisticTerrain } from './terrainGenerator.js';
import { addMarkers } from './markerManager.js';


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

// Store markers for interaction
let markers = [];

function updateProgress(message, percentage) {
    if (statusText) statusText.innerText = message;
    if (progressBar) progressBar.style.width = percentage + '%';
}           
           
         
         
async function create1(scene,updateProgress) {
    try{
        const terrainMesh = await createRealisticTerrain(scene, updateProgress);
        
        // Add markers after terrain generation
        markers = addMarkers(scene, terrainMesh);

        // 更细右下角更细状态
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
    }catch(err)
    {    
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
    }
}


// 启动异步地图生成任务
create1(scene,updateProgress).catch(err => {
    console.error("Fatal error in main logic:",err);
});

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
// 状态标志位，用于控制动画期间是否更新控制器
let isTransitioning = false;

function onMouseClick(event) {
    // Calculate mouse position in normalized device coordinates
    // (-1 to +1) for both components
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Raycast against markers
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(markers);

    if (intersects.length > 0) {
        const selectedObject = intersects[0].object;
        if (selectedObject.userData && selectedObject.userData.url) {
            moveToTargetAndRedirect(selectedObject);
        }
    }
}

window.addEventListener('click', onMouseClick, false);

function moveToTargetAndRedirect(targetObject) {
    // 标记开始过渡动画
    isTransitioning = true;
    
    // 禁用控制器，防止用户干扰
    controls.enabled = false;
    controls.autoRotate = false; // 停止自动旋转

    // 获取目标的世界坐标
    const targetPosition = new THREE.Vector3();
    targetObject.getWorldPosition(targetPosition);

    // 计算方向向量 (从相机指向目标)
    const direction = new THREE.Vector3().subVectors(targetPosition, camera.position).normalize();

    // 初始距离
    const startDistance = camera.position.distanceTo(targetPosition);
    
    // 停止距离 (距离目标多少单位时停止，或者直接撞上去)
    // 题目要求“逐渐模糊”，通常意味着离得很近。
    // 设一个极小的距离作为终点判定
    const stopDistance = 5; 

    // 总路程
    const totalDistance = Math.max(0, startDistance - stopDistance);

    // 动画参数
    let startTime = null;
    const duration = 2000; // 动画持续时间 (毫秒)，可调整
    const startPos = camera.position.clone(); // Capture start position ONCE before animation loop
    
    // 计算起始注视点 (Start LookAt Point)
    // 为了平滑过渡，我们假设起始注视点在当前视线方向上，距离等于起到终点的距离
    // 这样可以避免旋转突变
    const startDir = new THREE.Vector3();
    camera.getWorldDirection(startDir);
    const distToTarget = camera.position.distanceTo(targetPosition);
    const startLookAtPoint = startPos.clone().add(startDir.multiplyScalar(distToTarget));

    // 模糊效果 HTML 元素
    let blurOverlay = document.getElementById('blur-overlay');
    if (!blurOverlay) {
        blurOverlay = document.createElement('div');
        blurOverlay.id = 'blur-overlay';
        blurOverlay.style.position = 'fixed';
        blurOverlay.style.top = '0';
        blurOverlay.style.left = '0';
        blurOverlay.style.width = '100%';
        blurOverlay.style.height = '100%';
        blurOverlay.style.pointerEvents = 'none';
        blurOverlay.style.transition = 'backdrop-filter 0.1s ease';
        blurOverlay.style.zIndex = '9999';
        document.body.appendChild(blurOverlay);
    }

    function animateMove(time) {
        if (!startTime) startTime = time;
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1.0); // 0.0 to 1.0

        // 使用缓动函数 (Ease In Out Quad) 让运动更自然，或者用简单的加速公式
        // 题目要求：固定加速度。这意味着距离 s = 0.5 * a * t^2
        // 但我们已知总距离和总时间，反推加速度 a = 2 * S / T^2
        // 当前时刻位移 s(t) = 0.5 * a * t^2 = 0.5 * (2*S/T^2) * t^2 = S * (t/T)^2
        // 所以 progress 的平方就是归一化的位移比例。
        
        // 1. 获取起点 StartPos已经在外部定义
        // 2. 获取终点 EndPos = StartPos + Direction * TotalDistance
        const endPos = new THREE.Vector3().copy(startPos).addScaledVector(direction, totalDistance);
        
        // 3. CurrentPos = Lerp(StartPos, EndPos, progress * progress)
        camera.position.lerpVectors(startPos, endPos, progress * progress);
        
        // 平滑改变注视点
        // 计算当前帧应该看向的“虚拟目标点”
        const currentLookAt = new THREE.Vector3().lerpVectors(startLookAtPoint, targetPosition, progress * progress);
        camera.lookAt(currentLookAt);

        // 模糊效果随着距离增加而增强
        // max blur 20px
        const blurAmount = progress * 20; 
        blurOverlay.style.backdropFilter = `blur(${blurAmount}px)`;
        // 兼容性写法
        blurOverlay.style.webkitBackdropFilter = `blur(${blurAmount}px)`;

        if (progress < 1.0) {
            requestAnimationFrame(animateMove);
        } else {
            // 动画结束，跳转
            window.location.href = targetObject.userData.url;
        }
    }

    requestAnimationFrame(animateMove);
}


//6. 动画循环 
function animate() {
    //告诉浏览提，animate这个函数需要按照一定频率循环调用
    requestAnimationFrame(animate);

    // 只有在非过渡状态下才更新控制器
    // 这样可以防止 OrbitControls 在我们手动控制相机移动时产生冲突（导致翻转或抖动）
    if (!isTransitioning) {
        controls.update(); // 必须调用，否则阻尼和自动旋转无效
    }

    renderer.render(scene, camera);
}


animate();

//7. 自适应窗口
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});