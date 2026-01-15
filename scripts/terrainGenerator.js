import * as THREE from 'three';
import { generateTerrainDataAsync } from './generation/main.js';
import { terrainConfig } from './config.js';


export async function createRealisticTerrain(scene, onProgress) {
    // Configuration
    const width = terrainConfig.width; 
    const height = terrainConfig.height;
    const seed = Math.floor(Math.random() * 200000);
    
    try {
        // Generate height data (Float32Array)
        // Pass the onProgress callback to the generator
        const heightData = await generateTerrainDataAsync(width, height, seed, 300, 4.0, 0, onProgress);
        
        if (onProgress) onProgress("Building 3D Mesh...", 95);

        // Create Three.js Geometry using BufferGeometry directly to avoid array limits in PlaneGeometry
        // const geometry = new THREE.PlaneGeometry(2000, 2000, width - 1, height - 1);
        
        const geometry = new THREE.BufferGeometry();
        
        const verticesCount = width * height;
        const indicesCount = (width - 1) * (height - 1) * 6;
        
        // Use Uint32Array for indices allowing > 65k vertices
        const indices = new Uint32Array(indicesCount);
        const vertices = new Float32Array(verticesCount * 3);
        const uvs = new Float32Array(verticesCount * 2);
        
        // Generate vertices and UVs
        // PlaneGeometry: X goes right, Y goes up.
        // Our grid: x=0..width, y=0..height.
        const halfSize = 1000;
        const segmentW = 2000 / (width - 1);
        const segmentH = 2000 / (height - 1);
        
        for (let i = 0; i < height; i++) {
            const y = i * segmentH - halfSize; //
            // X is -width/2 to width/2
            // Y is height/2 to -height/2  <-- IMPORTANT
            
            const Y = halfSize - i * segmentH;

            for (let j = 0; j < width; j++) {
                const X = j * segmentW - halfSize;

                const index = (i * width + j);
                
                // Position X, Y, Z (Z is flat 0 initially)
                vertices[index * 3] = X;
                vertices[index * 3 + 1] = Y;
                vertices[index * 3 + 2] = 0; // Will be updated
                
                // UVs
                uvs[index * 2] = j / (width - 1);
                uvs[index * 2 + 1] = 1 - (i / (height - 1));
            }
        }
        
        // Generate Indices
        let ptr = 0;
        for (let i = 0; i < height - 1; i++) {
            for (let j = 0; j < width - 1; j++) {
                const a = i * width + j;
                const b = i * width + j + 1;
                const c = (i + 1) * width + j;
                const d = (i + 1) * width + j + 1;
                indices[ptr++] = a;
                indices[ptr++] = c;
                indices[ptr++] = b;
                indices[ptr++] = b;
                indices[ptr++] = c;
                indices[ptr++] = d;
            }
        }
        
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        // Now Apply Height
        geometry.rotateX(-Math.PI / 2); // Rotate to XZ plane if desired.       
        const posAttribute = geometry.attributes.position;
        // const posArray = posAttribute.array; // This is 'vertices' ref
        
        // Recalculate positions to act like XZ plane terrain with Y=height
        for (let i = 0; i < height; i++) {
            const z = i * segmentH - halfSize; // Z coordinate analogous to Y in loop
            for (let j = 0; j < width; j++) {
                const x = j * segmentW - halfSize;
                
                const index = (i * width + j);
                const h = heightData[index];
                
                // X, Y (Up), Z
                vertices[index * 3] = x;
                vertices[index * 3 + 1] = h * terrainConfig.peakHeight; // Apply scale directly
                vertices[index * 3 + 2] = z; 
            }
        }
        // Do NOT rotate geometry anymore since we built it in XZ.
        // geometry.rotateX(-Math.PI / 2); // Removed
        
        posAttribute.needsUpdate = true;
        geometry.computeVertexNormals();

        // Color Logic Recovery
        const colorAttribute = new THREE.BufferAttribute(new Float32Array(verticesCount * 3), 3);
        
        let minZ = heightData[0];
        let maxZ = heightData[0];
        for(let i=1; i<verticesCount; i++) {
            if(heightData[i] < minZ) minZ = heightData[i];
            if(heightData[i] > maxZ) maxZ = heightData[i];
        }

        const colorBottom = new THREE.Color(0xe0cda9); 
        const colorMid = new THREE.Color(0x5a6e5a);    
        const colorTop = new THREE.Color(0xffffff);    
        
        const PEAK_HEIGHT = maxZ > 0 ? maxZ : 1.0; 
        const SNOW_START = 0.4; 
        const SNOW_RANGE = 1.0 - SNOW_START;
        
        const tempColor = new THREE.Color();

        for (let i = 0; i < verticesCount; i++) {
             const h = heightData[i];
             const z = h / PEAK_HEIGHT; 
             
             if(z < 0.15) {
                 tempColor.copy(colorBottom).lerp(colorMid, z / 0.15); 
             } else if (z < SNOW_START) {
                 tempColor.copy(colorMid);
             } else {
                 tempColor.copy(colorMid).lerp(colorTop, (z - SNOW_START) / SNOW_RANGE);
             }
             
             colorAttribute.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
        }
        
        geometry.setAttribute('color', colorAttribute);

        // Material
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true, // Enable vertex colors
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide,
            flatShading: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;


        mesh.position.y = -250;
        scene.add(mesh);

        if (onProgress) onProgress("Done!", 100);
        return mesh;
    } catch (err) {
        console.error("Terrain Generation Failed:", err);
        throw err;
    }
}
