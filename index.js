import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { TIFFLoader } from 'three/addons/loaders/TIFFLoader.js';
import { ThreeScene } from './three-scene.js';

class DadsScanScene extends ThreeScene {

    constructor() {
        super();
        this.loadModel();
    }

    ensurePlanarUVs(geometry) {
        if (geometry.attributes.uv) return;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return;

        const size = box.getSize(new THREE.Vector3());
        const pos = geometry.attributes.position;
        if (!pos) return;

        const uvs = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i) - box.min.x;
            const z = pos.getZ(i) - box.min.z;
            uvs[i * 2] = size.x ? x / size.x : 0;
            uvs[i * 2 + 1] = size.z ? z / size.z : 0;
        }

        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }

    ensureUV2(geometry) {
        if (geometry.attributes.uv2) return;
        const uv = geometry.attributes.uv;
        if (!uv) return;
        geometry.setAttribute('uv2', uv);
    }

    async loadWoodMaterial() {
        const texLoader = new THREE.TextureLoader();
        const exrLoader = new EXRLoader();

        const [map, displacementMap, normalMap, roughnessMap] = await Promise.all([
            texLoader.loadAsync('./image.png'),
            texLoader.loadAsync('./wood.blend/textures/wood_table_worn_disp_4k.png'),
            exrLoader.loadAsync('./wood.blend/textures/wood_table_worn_nor_gl_4k.exr'),
            exrLoader.loadAsync('./wood.blend/textures/wood_table_worn_rough_4k.exr'),
        ]);

        map.colorSpace = THREE.SRGBColorSpace;

        for (const t of [map, displacementMap, normalMap, roughnessMap]) {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(1, 1);
        }

        return new THREE.MeshPhysicalMaterial({
            map,
            normalMap,
            roughnessMap,
            // displacementMap,
            displacementScale: 0.01,
            metalness: 1,
            roughness: 1,
        });
    }

    async loadMarble2KMaterial() {
        const texLoader = new THREE.TextureLoader();
        const tiffLoader = new TIFFLoader();

        const basePath = './marble/2K/Poliigon_StoneQuartzite_8060_';

        const [map, normalMap, roughnessMap, aoMap, metalnessMap] = await Promise.all([
            texLoader.loadAsync(`${basePath}BaseColor.jpg`),
            texLoader.loadAsync(`${basePath}Normal.png`),
            texLoader.loadAsync(`${basePath}Roughness.jpg`),
            texLoader.loadAsync(`${basePath}AmbientOcclusion.jpg`),
            texLoader.loadAsync(`${basePath}Metallic.jpg`),
        ]);

        map.colorSpace = THREE.SRGBColorSpace;

        // Displacement is a TIFF; if it fails to load we just omit it.
        let displacementMap = null;
        try {
            displacementMap = await tiffLoader.loadAsync(`${basePath}Displacement.tiff`);
        } catch (e) {
            console.warn('Failed to load marble displacement TIFF; continuing without displacement.', e);
        }

        const textures = [map, normalMap, roughnessMap, aoMap, metalnessMap].filter(Boolean);
        if (displacementMap) textures.push(displacementMap);

        for (const t of textures) {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(1, 1);
            t.anisotropy = 8;
        }

        return new THREE.MeshStandardMaterial({
            map,
            normalMap,
            roughnessMap,
            aoMap,
            metalnessMap,
            displacementMap,
            displacementScale: 0.02,
            metalness: 1.0,
            roughness: 0.8,
        });
    }

    async loadModel() {
        let status = document.querySelector(".model-load-status");
        console.log("Here", status)
        let url = this.getAttribute("src");
        if (!url) return;
        let loader = new PLYLoader();
        status && (status.textContent = "Loading model...");
        let geometry = await loader.loadAsync(url, (event) => {
            if (event.lengthComputable) {
                let percent = Math.round((event.loaded / event.total) * 100);
                status && (status.textContent = `Loading... ${percent}%`);
            }
        })
        status && (status.textContent = "Processing model...");
        geometry.computeVertexNormals();

        // center mesh 
        geometry.computeBoundingBox();
        let center = geometry.boundingBox.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);    

        // this.ensurePlanarUVs(geometry);
        // this.ensureUV2(geometry);

        // const materialType = (this.getAttribute('material') || 'wood').toLowerCase();
        // const material = materialType === 'wood'
        //     ? await this.loadWoodMaterial()
        //     : await this.loadMarble2KMaterial();

        const material = new THREE.MeshStandardMaterial({color: 0xaaaaaa, metalness: 1, roughness: 0});

        let mesh = new THREE.Mesh(geometry, material);
        this.root.add(mesh);

        status && status.toggleAttribute("loaded", true);
    }
}

customElements.define("dads-scan-scene", DadsScanScene);