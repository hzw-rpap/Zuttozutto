import * as THREE from 'three';
import { terrainConfig } from './config.js';

export function addMarkers(scene, terrainMesh) {
    const geometry = terrainMesh.geometry;
    const positions = geometry.attributes.position.array;
    const count = positions.length / 3;

    // 1. Collect candidate points (Filtering for efficiency)
    // Instead of strict "Top 100", get a larger pool of "high" points to ensure distribution.
    // Full sorting 1M points is okay in JS (approx 200-400ms), but we can optimize by threshold.
    
    // First pass: Find Max Height to set a dynamic threshold
    let maxY = -Infinity;
    for (let i = 0; i < count; i += 100) { // Sample every 100th point to estimate maxY quickly
        const y = positions[i * 3 + 1];
        if (y > maxY) maxY = y;
    }
    // Safety if sampling missed the true peak
    if (maxY === -Infinity) maxY = 100;

    // Threshold: Consider points in the top 60% of height (visual peaks)
    // The previous issue was the candidates were too clustered. 
    // Expanding the pool allows us to find high points that are further apart.
    const threshold = maxY * 0.4; 
    
    let highPoints = [];
    for (let i = 0; i < count; i++) {
        const y = positions[i * 3 + 1];
        if (y > threshold) {
            highPoints.push({
                x: positions[i * 3],
                y: y,
                z: positions[i * 3 + 2],
                index: i
            });
        }
    }

    // Sort by Height Descending (Highest first)
    // This ensures we pick the most prominent peaks first.
    highPoints.sort((a, b) => b.y - a.y);

    const selectedPoints = [];
    const minDistance = terrainConfig.min_distance || 100;
    
    // 定义标签和对应的链接
    const markerData = [
        { label: "个人简介", url: "profile.html" },
        { label: "个人博客", url: "blog.html" },
        { label: "课堂笔记", url: "notes.html" },
        { label: "科研笔记", url: "research.html" }
    ];
    
    const needed = markerData.length;

    // 2. Greedy Selection
    // Iterate through high points and select if far enough from existing selections.
    for (let i = 0; i < highPoints.length; i++) {
        const candidate = highPoints[i];
        
        // Check distance against all currently selected
        let valid = true;
        for (const p of selectedPoints) {
            const dist = Math.sqrt(
                Math.pow(candidate.x - p.x, 2) + 
                Math.pow(candidate.y - p.y, 2) + 
                Math.pow(candidate.z - p.z, 2)
            );
            
            if (dist < minDistance) {
                valid = false;
                break;
            }
        }

        if (valid) {
            selectedPoints.push(candidate);
            if (selectedPoints.length >= needed) {
                break;
            }
        }
    }

    // 3. Check count
    if (selectedPoints.length <= 4 && selectedPoints.length < 4) { 
        console.warn(`Only found ${selectedPoints.length} suitable points out of ${highPoints.length} candidates.`);
        // Fallback: If we really can't find 4 high points separated by min_distance,
        // we might want to relax the distance or height constraint, but for now report error as requested.
        console.error("Could not find 4 suitable points for markers.");
        // alert("Error: Could not find 4 suitable points matching criteria."); 
        // Continue to show whatever we found instead of crashing/stopping completely
    }

    // 4. Create floating text boxes
    const textureLoader = new THREE.TextureLoader();
    const createdSprites = [];
    
    selectedPoints.forEach((point, index) => {
        if (index >= markerData.length) return;

        const data = markerData[index];
        const sprite = createTextSprite(data.label);

        // Store URL in userData
        sprite.userData = { url: data.url };
        
        // Position: 50 units above the point
        // Note: The point coordinates are LOCAL to the mesh geometry.
        // We need to account for terrainMesh.position.y if we add sprites to the SCENE.
        // Or we can add sprites to the terrainMesh?
        // If we add to scene: WorldY = point.y + terrainMesh.position.y + 50
        // If we add to terrainMesh: LocalY = point.y + 50
        // Adding to terrainMesh is easier for transformations, but sprites facing camera works either way.
        // Let's add to scene to keep them independent or attach to mesh.
        // Attaching to mesh means if mesh rotates, sprite position rotates with it (good).
        // Since terrain is static usually, it's fine.
        
        sprite.position.set(point.x, point.y + 50, point.z);
        terrainMesh.add(sprite); // Make it a child of the terrain

        createdSprites.push(sprite);
    });

    return createdSprites;
}

function createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Canvas settings
    const fontSize = 48; // High res for text
    const padding = 20;
    const border = 5;
    
    ctx.font = `bold ${fontSize}px Arial`;
    const textMetrics = ctx.measureText(message);
    const textWidth = textMetrics.width;
    
    canvas.width = textWidth + padding * 2 + border * 2;
    canvas.height = fontSize + padding * 2 + border * 2;

    // Draw Box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Semi-transparent black background
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = border;
    
    // Round rect function or just rect
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Draw Text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Scale sprite to be reasonable size in world units
    // Adjust scale based on aspect ratio of canvas
    const scale = 40; // Base size
    sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
    
    return sprite;
}
