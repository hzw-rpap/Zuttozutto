import { stackblurJob } from './stackblur.js';

self.onmessage = function(e) {
    const { src, w, h, radius, cores, core, step } = e.data;
    
    // Convert Float32Array to typed array if it was transferred?
    // If using SharedArrayBuffer, src is already a Float32Array view on it.
    
    stackblurJob(src, w, h, radius, cores, core, step, new Float32Array((radius * 2) + 1));
    
    self.postMessage({ core, step, status: 'done' });
};
