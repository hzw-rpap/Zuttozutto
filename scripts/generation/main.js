import { Rng } from './utils.js';
import { DLA } from './dla.js';
import { Normalize, Sum_Blurred, ApplyRadialFalloff, Add_Perlin, Erosion ,Add_Perlin_detail} from './terrainOps.js';
import { terrainConfig } from '../config.js';

export async function generateTerrainDataAsync(width, height, seed = 134127, terrain_max_points = 300, falloff_power = 4.0, need_fall_off = 0, onProgress) {
    const report = (msg, pct) => {
        if(onProgress) onProgress(msg, pct);
        console.log(`[Progress ${pct.toFixed(0)}%] ${msg}`);
    };

    const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 10));

    report(`Generating terrain ${width}x${height} with seed ${seed}...`, 0);
    await yieldToUI();
    
    let t1 = performance.now();

    // Allocate buffers
    // In C++ logic, main buffers are data and perlin_weight.
    // Ensure size is exactly width * height.
    let data = new Float32Array(width * height);
    let perlin_weight = new Float32Array(width * height); 
    
    // Initialize perlin_weight
    for(let i=0; i<100; ++i) perlin_weight[i] = 1.0 / Math.pow(2.0, i);

    let rng = new Rng(seed);

    // 1. DLA Generation
    report("Running DLA Algorithm...", 10);
    await yieldToUI();
    DLA(width, height, data, terrain_max_points, rng, seed);
    
    Normalize(data);
    
    // 2. Blur and Summation
    report("Applying Stackblur & Summation...", 30);
    await yieldToUI();
    
    Sum_Blurred(width, height, data, perlin_weight, terrainConfig.blurredSteps, terrainConfig.blurredWeights);
    // Note: Normalize(data) is called INSIDE Sum_Blurred at the very end in javascript_version
    // So we don't need to call it again here if Sum_Blurred does it.
    // Checking javascript_version/terrainOps.js: Sum_Blurred ends with Normalize(data).
    // Checking scripts/generation/terrainOps.js: Sum_Blurred ends with Normalize(data).
    // So this Normalize call here is redundant but harmless.
    // However, javascript_version/main.js DOES call Normalize(data) after Sum_Blurred returns.
    // So we should KEEP it to be exactly consistent.
    Normalize(data);

    // Add Perlin
    report("Adding Perlin Noise...", 50);
    await yieldToUI();
    Add_Perlin(width, height, data, perlin_weight, seed, terrainConfig.perlinFreq);
    if (need_fall_off) ApplyRadialFalloff(width, height, data, falloff_power);

    // 3. Erosion
    report("Simulating Erosion (This may take a while)...", 70);
    await yieldToUI();
    Erosion(width, height, data, rng, terrainConfig.erosionCycles);
    Add_Perlin_detail(width, height, data, perlin_weight, seed, terrainConfig.perlinFreq);

    // Normalize Final Logic
    report("Finalizing Data...", 90);
    await yieldToUI();

    let maxValFound = 0.000001;
    for (let i = 0; i < data.length; i++) {
        let abs = Math.abs(data[i]);
        if (abs > maxValFound) maxValFound = abs;
    }
    for (let i = 0; i < data.length; i++) data[i] /= maxValFound;

    // Check NaNs
    let hasNaN = false;
    for (let i = 0; i < data.length; i++) {
        if (Number.isNaN(data[i]) || !Number.isFinite(data[i])) {
            hasNaN = true;
            data[i] = 0.0;
        }
    }
    if (hasNaN) console.log("Warning: Data contained NaNs (Fixed automatically)!");

    let t2 = performance.now();
    console.log(`Total generation time: ${(t2 - t1).toFixed(2)} ms`);
    
    report("Generation Complete!", 100);
    await yieldToUI();

    return data;
}
