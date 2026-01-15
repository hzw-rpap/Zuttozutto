import * as THREE from 'three';
import { generateTerrainDataAsync } from './generation/main.js';

/**
 * Generates the terrain geometry directly from the procedural algorithm
 * and adds it to the scene.
 */
export async function createRealisticTerrain(scene, onProgress) {
    // Configuration
    // User requested 4096 * 4096 default size for exact consistency.
    // Warning: This will be slow in browser and might effectively freeze the UI without off-screen worker properly set up.
    // But user asked for exact consistency first.
    const width = 4096; 
    const height = 4096;
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
        // Map grid (0..width-1, 0..height-1) to world coords (-1000..1000, -1000..1000)
        // PlaneGeometry(2000, 2000) is centered. X: -1000 to 1000, Y: 1000 to -1000 (usually Y is up in 2D, but Z in 3D)
        // PlaneGeometry is created on XY plane by default. We rotate it later.
        // Let's stick to X, Y plane logic then rotate X by -90 deg (which swaps Y to Z, and flips sign?)
        // PlaneGeometry: X goes right, Y goes up.
        // Our grid: x=0..width, y=0..height.
        const halfSize = 1000;
        const segmentW = 2000 / (width - 1);
        const segmentH = 2000 / (height - 1);
        
        for (let i = 0; i < height; i++) {
            const y = i * segmentH - halfSize; // -1000 to 1000? PlaneGeometry usually Y goes + to -? 
            // Three.js PlaneGeometry starts top-left usually? 
            // Actually PlaneGeometry builds usually: x: -half to +half, y: +half to -half.
            // Let's implement generic grid.
            // y coordinate: (height - 1 - i) * ... if we want top-down. 
            // Let's match standard PlaneGeometry:
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
                
                // Faces: a-b-d, a-d-c? Standard PlaneGeometry: a, c, b and b, c, d
                // Triangle 1: a, c, b (CounterClockWise?)
                // Three.js CCW is standard front face.
                // vertices: a(top-left), b(top-right), c(bot-left), d(bot-right)
                // Y goes down.
                // 1st tri: a(tl), c(bl), b(tr) -> CCW?
                // Vector AC is down, Vector AB is right. Cross(Down, Right) = Out (Z+). Correct.
                
                indices[ptr++] = a;
                indices[ptr++] = c;
                indices[ptr++] = b;
                
                // 2nd tri: b(tr), c(bl), d(br)
                // Vector BC (tr to bl), Vector BD (tr to br).
                // Or b, c, d. b(tr), c(bl), d(br).
                // Vector CB is up-right. Vector CD is right. Cross(UpRight, Right) = In (Z-). Wrong.
                // We want b, d, c? No.
                // Let's check typical quad split: a, c, d is bottom-left tri?
                // Standard: a, c, b and b, c, d. (This covers the quad).
                
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
        // Note: After rotation, Y becomes Up. 
        // Initial vertices[... + 1] was Y. vertices[... + 2] was Z=0.
        // After rotX(-90): 
        // y' = y*cos - z*sin = 0 - 0 = 0?
        // z' = y*sin + z*cos = -y.
        // So Y becomes Z (inverted).
        // Geometry becomes flat on XZ plane. Z varies. Y is 0.
        // But we want to set Height. Height usually is Y in 3D or Z in typical terrain maps?
        // Standard Three.js: Y is up.
        // PlaneGeometry created on XY, rotated -90 around X => lies on XZ. Height is Y.
        
        // HOWEVER, we have manual control. Why rotate?
        // We can just build it on XZ plane directly!
        // X = j * segW - half.
        // Z = i * segH - half.
        // Y = heightData.
        // THIS IS SIMPLER.
        
        // Re-do vertices generation logic inside the loop above?
        // Let's just update the vertices directly here, assuming above loop created generic Plane structure in XY.
        // If we want consistency with PlaneGeometry:
        // PlaneGeometry + rotateX(-Math.PI/2) results in:
        // x -> x
        // y -> z
        // z -> -y (height)
        // So we should map heightData to positions.
        
        // But creating BufferAttribute again is wasteful.
        // Let's overwrite correct positions now.
        
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
                vertices[index * 3 + 1] = h * 400; // Apply scale directly
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
