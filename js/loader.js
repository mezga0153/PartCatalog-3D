import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const dracoLoader = new DRACOLoader();
// Resolve through the import map so the decoder matches the three.js version
dracoLoader.setDecoderPath(import.meta.resolve('three/addons/libs/draco/gltf/'));

// GLTF loader that also handles Draco- and meshopt-compressed files
export function createGLTFLoader() {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
}
