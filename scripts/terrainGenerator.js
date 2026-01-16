import * as THREE from 'three';
import { terrainConfig } from './config.js';


export async function createRealisticTerrain(scene, onProgress) {
    return new Promise(
        // Executor 異步執行
        (resolve, reject) => {
            
            // Configuration
            const seed = Math.floor(Math.random() * 200000);
            
            // Spawn Worker
            // Use URL-based worker creation relative to this module for better reliability
            const worker = new Worker(new URL('./generation/terrainWorker.js', import.meta.url), { type: 'module' });

            worker.onmessage = (e) => {
                const data = e.data;
                if (data.type === 'progress') {
                    if (onProgress) onProgress(data.message, data.percentage);
                } else if (data.type === 'complete') {
                    onProgress("Rendering...", 100);
                    
                    const { vertices, indices, uvs, colors } = data;
                    
                    const geometry = new THREE.BufferGeometry();
                    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
                    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

                    geometry.computeVertexNormals();

                    // Advanced Material
                    const material = new THREE.MeshStandardMaterial({
                        vertexColors: true, // Enable vertex coloring
                        roughness: 0.8,
                        metalness: 0.2,
                        flatShading: true, 
                        side: THREE.DoubleSide
                    });

                    const terrainMesh = new THREE.Mesh(geometry, material);
                    terrainMesh.castShadow = true;
                    terrainMesh.receiveShadow = true;
                    
                    // Restore position adjustment
                    // Based on previous water level at -224, terrain usually sits slightly below or adjusted to match.
                    // Assuming original logic placed it around -250 to allow water to cover low parts.
                    terrainMesh.position.y = -250;

                    scene.add(terrainMesh);
                    
                    worker.terminate();
                    resolve(terrainMesh);
                } else if (data.type === 'error') {
                    worker.terminate();
                    reject(new Error(data.message));
                }
            };

            worker.onerror = (err) => {
                worker.terminate();
                console.error("Worker Error Event:", err);
                // Try to extract useful info from the error event
                const msg = err.message || "Failed to load terrainWorker.js (Script load error or syntax error)";
                reject(new Error(msg));
            };

            // Start Generation
            worker.postMessage({
                type: 'start',
                seed: seed
            });
        }
    );
}
