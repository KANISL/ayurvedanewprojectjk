// apped.js - Ayurveda App Logic
// NOTE: We don't need the Google API Key anymore because the Chat is now handled by your Hugging Face space!

const app = Vue.createApp({
    data() {
        return {
            // Screen & Auth State
            currentPage: 'landing',
            currentTab: 'chat', // Defaults to the Hugging Face Chat
            isLoggedIn: false,
            showAuthModal: false,
            authMode: 'login',
            user: null,
            authForm: { name: '', email: '', password: '' },

            // 3D Model State
            activeDosha: 'none',
            loadingModel: false,
            threeScene: null,
            threeRenderer: null,
            threeCamera: null,
            bodyParts: {}, 
            loadedOrgans: { brain: null, heart: null, kidneyL: null, kidneyR: null }
        }
    },
    methods: {
        // --- Navigation ---
        handleStartChatClick() {
            if (this.isLoggedIn) {
                this.currentPage = 'dashboard';
                this.switchTab('chat');
            } else {
                this.showAuthModal = true;
                this.authMode = 'signup';
            }
        },
        toggleAuthMode() { this.authMode = (this.authMode === 'signup') ? 'login' : 'signup'; },
        handleAuthSubmit() {
            setTimeout(() => {
                this.isLoggedIn = true;
                this.user = { name: this.authForm.name || 'Ayurveda User' };
                this.showAuthModal = false;
                this.currentPage = 'dashboard';
                this.authForm = { name: '', email: '', password: '' };
                this.switchTab('chat');
            }, 500);
        },
        logout() {
            this.isLoggedIn = false;
            this.currentPage = 'landing';
            this.user = null;
        },

        // --- Tabs Logic ---
        switchTab(tabName) {
            this.currentTab = tabName;
            // Only initialize 3D model if entering that tab for the first time
            if (tabName === 'model') {
                this.$nextTick(() => {
                    if (!this.threeScene) {
                        this.init3DModel();
                    }
                });
            }
        },

        // =========================================================
        // 🧬 3D ENGINE (SMART PIVOT CENTERING)
        // =========================================================
        init3DModel() {
            const container = document.getElementById('three-canvas-container');
            if (!container) return;

            // 1. Scene
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
            camera.position.set(0, 1, 16); 

            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.outputEncoding = THREE.sRGBEncoding;
            container.appendChild(renderer.domElement);

            // 2. Bright Lights
            scene.add(new THREE.AmbientLight(0xffffff, 1.2)); 
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
            dirLight.position.set(5, 10, 10);
            scene.add(dirLight);

            // 3. Glass Body Shell (Reference)
            const glassMat = new THREE.MeshPhysicalMaterial({ 
                color: 0xffffff, metalness: 0.1, roughness: 0.1, transmission: 0.9, transparent: true, opacity: 0.2 
            });
            const bodyGroup = new THREE.Group();

            const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 32), glassMat.clone());
            head.position.y = 5.2; bodyGroup.add(head);
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 4.5, 32), glassMat.clone());
            torso.position.y = 1.0; bodyGroup.add(torso);
            const hips = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 2.5, 32), glassMat.clone());
            hips.position.y = -2.5; bodyGroup.add(hips);

            scene.add(bodyGroup);
            this.bodyParts = { head, torso, hips };

            // 4. LOAD ORGANS
            const loader = new THREE.GLTFLoader();
            this.loadingModel = true;

            const loadAndFit = (path, name, targetSize, position) => {
                loader.load(path, (gltf) => {
                    const rawModel = gltf.scene;
                    
                    // A. Create a Pivot Group
                    const pivot = new THREE.Group();
                    
                    // B. Measure and Center
                    const box = new THREE.Box3().setFromObject(rawModel);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    
                    rawModel.position.sub(center);
                    pivot.add(rawModel);

                    // C. Scale
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scaleFactor = targetSize / maxDim;
                    pivot.scale.set(scaleFactor, scaleFactor, scaleFactor);

                    // D. Position
                    pivot.position.set(position.x, position.y, position.z);

                    // E. Color
                    pivot.traverse((child) => {
                        if (child.isMesh) {
                            child.material.emissive = new THREE.Color(0x222222);
                        }
                    });

                    bodyGroup.add(pivot);
                    this.loadedOrgans[name] = pivot;
                    console.log(`✅ Loaded ${name}`);
                }, undefined, (error) => console.error(`❌ Error loading ${path}`, error));
            };

            // Loading organs (filenames match your upload)
            loadAndFit('brain human.glb', 'brain', 2.0, { x: 0, y: 5.0, z: 0 }); 
            loadAndFit('heart.glb', 'heart', 1.5, { x: 0.2, y: 1.8, z: 0.3 });
            loadAndFit('VH_M_Kidney_L.glb', 'kidneyL', 1.2, { x: -0.6, y: -0.5, z: -0.4 });
            loadAndFit('VH_M_Kidney_R.glb', 'kidneyR', 1.2, { x: 0.6, y: -0.5, z: -0.4 });

            this.loadingModel = false;

            // 5. Controls
            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.autoRotate = true;

            const animate = () => {
                requestAnimationFrame(animate);
                controls.update();
                // Pulse Animation
                if (this.activeDosha !== 'none') {
                    const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.05;
                    if(this.activeDosha === 'pitta' && this.loadedOrgans.heart) {
                        const originalScale = this.loadedOrgans.heart.userData.baseScale || this.loadedOrgans.heart.scale.x;
                        this.loadedOrgans.heart.scale.setScalar(originalScale * pulse);
                    }
                }
                renderer.render(scene, camera);
            };
            animate();
            
            this.threeScene = scene;
        },

        simulateDosha(dosha) {
            this.activeDosha = dosha;
            const colors = { vata: 0x3399FF, pitta: 0xFF3333, kapha: 0x33FF99 };
            
            // Reset
            Object.values(this.loadedOrgans).forEach(m => {
                if(m) {
                    if(!m.userData.baseScale) m.userData.baseScale = m.scale.x;
                    m.traverse(c => { if(c.isMesh) c.material.emissive.setHex(0x222222); });
                }
            });
            Object.values(this.bodyParts).forEach(m => m.material.opacity = 0.2);

            if(dosha === 'reset') return;

            const highlight = (name, col) => {
                if(this.loadedOrgans[name]) {
                    this.loadedOrgans[name].traverse(c => {
                        if(c.isMesh) {
                            c.material.emissive.setHex(col);
                            c.material.emissiveIntensity = 0.8;
                        }
                    });
                }
            };

            if(dosha === 'vata') { highlight('kidneyL', colors.vata); highlight('kidneyR', colors.vata); }
            if(dosha === 'pitta') { highlight('heart', colors.pitta); }
            if(dosha === 'kapha') { highlight('brain', colors.kapha); }
        }
    }
});

app.mount('#app');