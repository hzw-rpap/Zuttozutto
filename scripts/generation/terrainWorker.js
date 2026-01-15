import { generateTerrainDataAsync } from './main.js';
import { terrainConfig } from '../config.js';

self.onmessage = async (e) => {
    if (e.data.type === 'start') {
        const { seed } = e.data;
        const { width, height, peakHeight } = terrainConfig;

        const onProgress = (msg, pct) => {
            self.postMessage({ type: 'progress', message: msg, percentage: pct });
        };

        try {
            // Generate Height Data
            const heightData = await generateTerrainDataAsync(width, height, seed, 300, 4.0, 0, onProgress);

            self.postMessage({ type: 'progress', message: 'Building Geometry...', percentage: 95 });

            // Generate Geometry Data
            const verticesCount = width * height;
            const indicesCount = (width - 1) * (height - 1) * 6;

            const indices = new Uint32Array(indicesCount);
            const vertices = new Float32Array(verticesCount * 3);
            const uvs = new Float32Array(verticesCount * 2);

            // Plane parameters
            // We want to center it, so halfSize is 1000 (total 2000)
            const halfSize = 1000;
            const segmentW = 2000 / (width - 1);
            const segmentH = 2000 / (height - 1);

            // Generate Vertices, UVs and apply height
            
            // Calculate max height for coloring normalization
            let maxZ = 0;
            for(let i = 0; i < heightData.length; i++) {
                if(heightData[i] > maxZ) maxZ = heightData[i];
            }
            const PEAK_VAL = maxZ > 0 ? maxZ : 1.0;

            const SNOW_START = 0.4;
            const SNOW_RANGE = 1.0 - SNOW_START;
            
            // Helper to convert sRGB hex to Linear Float RGB array
            // THREE.Color uses sRGB -> Linear conversion by default in recent versions.
            // We approximate this with Gamma 2.2 to match the visual output of the original code which likely used THREE.Color()
            const hexToLinear = (hex) => {
                const r = ((hex >> 16) & 255) / 255;
                const g = ((hex >> 8) & 255) / 255;
                const b = (hex & 255) / 255;
                return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
            };

            // 0xe0cda9 -> Bottom
            const cBottom = hexToLinear(0xe0cda9);
            // 0x5a6e5a -> Mid
            const cMid = hexToLinear(0x5a6e5a);
            // 0xffffff -> Top
            const cTop = hexToLinear(0xffffff);

            const colors = new Float32Array(verticesCount * 3);

            for (let i = 0; i < height; i++) {
                const zPos = i * segmentH - halfSize; 
                // UV y usually goes 0..1 from bottom-left or top-left. 
                const vY = 1 - (i / (height - 1)); 

                for (let j = 0; j < width; j++) {
                    const xPos = j * segmentW - halfSize; 
                    const vX = j / (width - 1); 

                    const index = (i * width + j);
                    const h = heightData[index];

                    // Positions: X, Y(height), Z
                    vertices[index * 3] = xPos;
                    vertices[index * 3 + 1] = h * peakHeight;
                    vertices[index * 3 + 2] = zPos;

                    uvs[index * 2] = vX;
                    uvs[index * 2 + 1] = vY;
                    
                    // Vertex Coloring Logic
                    const z = h / PEAK_VAL; // normalized height 0..1
                    let r, g, b;

                    if (z < 0.15) {
                        // Lerp Bottom -> Mid
                        const t = z / 0.15;
                        r = cBottom[0] + (cMid[0] - cBottom[0]) * t;
                        g = cBottom[1] + (cMid[1] - cBottom[1]) * t;
                        b = cBottom[2] + (cMid[2] - cBottom[2]) * t;
                    } else if (z < SNOW_START) {
                        // Mid
                        r = cMid[0];
                        g = cMid[1];
                        b = cMid[2];
                    } else {
                         // Lerp Mid -> Top
                         const t = (z - SNOW_START) / SNOW_RANGE;
                         r = cMid[0] + (cTop[0] - cMid[0]) * t;
                         g = cMid[1] + (cTop[1] - cMid[1]) * t;
                         b = cMid[2] + (cTop[2] - cMid[2]) * t;
                    }
                    
                    colors[index * 3] = r;
                    colors[index * 3 + 1] = g;
                    colors[index * 3 + 2] = b;
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

                    // Two triangles: a-c-b, b-c-d
                    indices[ptr++] = a;
                    indices[ptr++] = c;
                    indices[ptr++] = b;
                    
                    indices[ptr++] = b;
                    indices[ptr++] = c;
                    indices[ptr++] = d;
                }
            }

            self.postMessage({
                type: 'complete',
                vertices,
                indices,
                uvs,
                colors
            }, [vertices.buffer, indices.buffer, uvs.buffer, colors.buffer]);

        } catch (err) {
            console.error(err);
            self.postMessage({ type: 'error', message: err.toString() + "\n" + (err.stack || "") });
        }
    }
};
