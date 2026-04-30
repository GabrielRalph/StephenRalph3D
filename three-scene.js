
import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    Group,
    Vector2,
    Raycaster,
    Matrix4,
    SRGBColorSpace,
    EquirectangularReflectionMapping,
    TextureLoader

} from "three";
import { ObjectControls } from './obj-control.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';


export function relURL(url, meta) {
    let root = meta.url;
    url = url.replace(/^\.\//, "/");
    if (url[0] != "/") url = "/" + url;
    return root.split("/").slice(0, -1).join("/") + url;
}

export class ThreeScene extends HTMLElement {
    cameraFOV = 75;
    cameraNear = 0.1;
    cameraFar = 1000;
    _loadPromises = new Map();
    constructor() {
        super();
        this._viewScale = 3;
        this.sizeObserver = null;
        const scene = new Scene();
        this.scene = scene;

        if (this.cachedEnvironment) {
            this.parseEnvironmentTexture(this.cachedEnvironment);
        }

        const camera = new PerspectiveCamera(this.cameraFOV, this.innerWidth / this.innerHeight, this.cameraNear, this.cameraFar);
        camera.position.set(0, 0, 100);

        // preserveDrawingBuffer ensures toDataURL works reliably for screenshots
        const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(this.innerWidth, this.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);

        
        const controls = new ObjectControls(renderer.domElement);
        let mat = this.getAttribute("mat");
        if (mat) {
            controls.isCached = false;
            let m = new Matrix4();
            m.fromArray(mat.split(",").map(e => parseFloat(e)));
            controls.matrix = m;
            controls.defaultMatrix = m.clone();
        }

        this.addDefaultLights();

        const root = new Group();
        scene.add(root);

        this.camera = camera;
        this.renderer = renderer;
        this.root = root;
        this.controls = controls;
    }


    addDefaultLights() {
        const light = new AmbientLight(0xffffff, 0.5);
        this.scene.add(light);

        const directionalLight = new DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 10);
        this.scene.add(directionalLight);
    }


    getViewSizeAtZ(z) {
        const viewSize = new Vector2(); // Target vector to store the result
        this.camera.getViewSize(this.camera.position.z - z, viewSize);
        return [viewSize.x, viewSize.y];
    }
 
    /**
     * @param {ResizeObserverEntry[]} entries
     */
    resize(entries) {
        if (this.renderer) {
            let { width, height } = entries[0].contentRect;
            let pos = this.camera.position.toArray();
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.camera = new PerspectiveCamera(this.cameraFOV, width / height, this.cameraNear, this.cameraFar);
            this.camera.position.set(...pos);
        }
        this.dispatchEvent(new Event("resize"));
    }

    connectedCallback() {
        this.appendChild(this.renderer.domElement);
        if (!this.sizeObserver) {
            this.sizeObserver = new ResizeObserver(this.resize.bind(this))
        }
        this.sizeObserver.observe(this);
        this.start();
        if (this.onconnected instanceof Function) {
            this.onconnected()
        }
    }


    disconnectedCallback() {
        this.stop();
        this.sizeObserver.disconnect();
        if (this.ondisconnected instanceof Function) {
            this.ondisconnected()
        }
    }


    renderScene() {
        this.renderer.render(this.scene, this.camera);
    }

    async start() {
        let stop = false;
        this.stop = () => {
            stop = true;
        }
        while (!stop) {
            await new Promise(requestAnimationFrame)
            if (this.beforeRender instanceof Function) {
                this.beforeRender()
            }
            if (this.root && this.controls) this.controls.update(this.root);
            if (this.pointclouds) {
                for (let pc of this.pointclouds) {
                    pc.update();
                }
            }

            this.renderScene();

            if (this.afterRender instanceof Function) {
                this.afterRender()
            }
        }
    }


    stop() { }

    add(object) {
        this.root.add(object);
    }

    clear() {
        function disposeRecursive(obj) {
            for (const child of obj.children) disposeRecursive(child);
            if (obj.isMesh) {
                obj.geometry?.dispose();
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material?.dispose();
            }
        }
        while (this.root.children.length) {
            const child = this.root.children[0];
            disposeRecursive(child);
            this.root.remove(child);
        }
    }


    rayCast(x, y, meshes) {
        let mouse = new Vector2(
            (x / this.clientWidth) * 2 - 1,
            -(y / this.clientHeight) * 2 + 1
        );
        let raycaster = new Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        let intersects = raycaster.intersectObjects(meshes || []);
        return intersects;
    }


    async addLoadPromise(loadMethod, url) {
        let promise = loadMethod(url, (p) => {
            this._loadPromises.set(promise, {progress: p.loaded / p.total, url});

            let str = [...this._loadPromises].map(([_, info]) => `Loading ${info.url}: ${(info.progress * 100).toFixed(1)}%`).join("\n");
            console.log(str);
        });
        this._loadPromises.set(promise, {url, progress: 0});
        let result = await promise;
        this._loadPromises.delete(promise);
        return result;
    }


    async waitForLoad() {
        await Promise.all(this._loadPromises.keys());
    }


    async loadEnvironment(url) {
        let ext = url.split(".").slice(-1)[0].toLowerCase();
        let loader = null;
        switch (ext) {
            case "hdr":
                loader = new RGBELoader();
                break;
            case "jpg":
            case "jpeg":
            case "png":
                loader = new TextureLoader();
                break;
            default:
                console.warn("Unsupported environment map format:", ext);
                return;
        }


        let texture = await this.addLoadPromise((u, p) => loader.loadAsync(u, p), url);
        if (this.scene) {
            this.parseEnvironmentTexture(texture)
        } else {
            this.cachedEnvironment = texture;
        }
    }
  
    set environment(env) {
        this.loadEnvironment(env);
    }   


    parseEnvironmentTexture(texture) {
        texture.colorSpace = SRGBColorSpace;
        texture.mapping = EquirectangularReflectionMapping;
        this.scene.environment = texture;
    }



    attributeChangedCallback(name, oldValue, newValue) {
        this[name] = newValue;
    }


    static get observedAttributes() {
        return ["environment"]
    }
}

customElements.define('three-scene', ThreeScene);