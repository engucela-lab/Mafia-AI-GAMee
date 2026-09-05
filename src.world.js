import * as THREE from 'three';

const loadTexture = (path, repeat = true) => {
    const texture = new THREE.TextureLoader().load(path);
    if (repeat) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

export const defaultProfiles = [
    { name: 'Gemini', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_gemini.png', personality: 'Curious, composed, and evidence-led. Ask precise questions before accusing.' },
    { name: 'ChatGPT', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_chatgpt.png', personality: 'Helpful, articulate, and diplomatic. Build a clear case from the table record.' },
    { name: 'ChatGPT1', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_chatgpt1.png', personality: 'A skeptical debate coach. Challenge weak logic and demand specific examples.' },
    { name: 'Claude', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_claude.png', personality: 'Thoughtful, cautious, and empathetic. Notice contradictions without overclaiming.' },
    { name: 'Claude1', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_claude1.png', personality: 'A methodical investigator. Keep a timeline and test every theory against facts.' },
    { name: 'Llama', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_llama.png', personality: 'Direct and independent. Speak plainly, take a stance, and revise when evidence changes.' },
    { name: 'Kimi', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_kimi.png', personality: 'Patient and detail-oriented. Track voting patterns and quietly connect the dots.' },
    { name: 'Grok', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_grok.png', personality: 'Sarcastic, witty, and rebellious, but still anchor every attack in a real event.' },
    { name: 'Perplexity', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_perplexity.png', personality: 'Concise and fact-focused. Cite exact statements, votes, and revealed information.' },
    { name: 'Firefly', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_firefly.png', personality: 'Creative and perceptive. Use unusual angles while staying loyal to the current match facts.' },
    { name: 'Copilot', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_copilot.png', personality: 'Professional and collaborative. Synthesize the room and invite quiet players into the case.' },
    { name: 'DeepSeek', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_deepseek.png', personality: 'Analytical and precise. Prefer probability, consistency, and falsifiable claims.' },
    { name: 'Siri', color: 0xFFFFFF, text: '#FFFFFF', img: 'Logo_Apple_Siri_iOS_2024.svg.png', personality: 'Short, sassy, and observant. Make one memorable point instead of rambling.' },
    { name: 'Midjourney', color: 0xFFFFFF, text: '#FFFFFF', img: 'logo_midjourney.png', personality: 'Imaginative and pattern-sensitive. Read tone carefully, but separate vibes from proof.' },
    { name: 'Player15', color: 0xFFFFFF, text: '#FFFFFF', img: 'avatar_texture.png', personality: 'Calm and unpredictable. Listen first, then make one useful, specific intervention.' }
];

// Export defaults for UI use
window.defaultAiProfiles = defaultProfiles;



// Helper to create text texture
export const createLabelTexture = (text, colorStr, showBox = true, fontSize = 80) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Dynamic Font Scaling to prevent overflow
    const maxWidth = 480;
    let activeFontSize = fontSize;
    ctx.font = `bold ${activeFontSize}px Roboto, Arial, sans-serif`;
    let textWidth = ctx.measureText(text).width;
    
    while (textWidth > maxWidth && activeFontSize > 20) {
        activeFontSize -= 4;
        ctx.font = `bold ${activeFontSize}px Roboto, Arial, sans-serif`;
        textWidth = ctx.measureText(text).width;
    }

    if (showBox) {
        // Background - semi-transparent dark
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 512, 256);
        
        // Border
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 502, 246);
    } else {
        ctx.clearRect(0, 0, 512, 256);
    }

    // Text
    ctx.fillStyle = colorStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

// Create Avatar
export const createAvatar = (profile) => {
    const group = new THREE.Group();

    // Load Avatar Image
    const map = loadTexture(profile.img, false);
    
    // Particle/Sprite setup
    const material = new THREE.SpriteMaterial({ 
        map: map,
        color: 0xffffff,
        transparent: true,
        opacity: 1.0, 
        depthWrite: false,
        depthTest: true
    });
    
    const sprite = new THREE.Sprite(material);
    // Larger square size for better visibility
    sprite.scale.set(4, 4, 1); 
    sprite.position.y = 0; // Centered in its group container
    group.add(sprite);

    // Name Label
    const labelTexture = createLabelTexture(profile.name, profile.text);
    
    // Always render label on top
    const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false 
    });
    
    const labelSprite = new THREE.Sprite(labelMaterial);
    labelSprite.name = "nameLabel";
    labelSprite.scale.set(4, 2, 1);
    labelSprite.center.set(0.5, 0); 
    labelSprite.position.set(0, 2.5, 0); // Floating above the avatar
    group.add(labelSprite);

    // Role Label (Hidden by default)
    const roleTexture = createLabelTexture("", "#ffffff");
    const roleMaterial = new THREE.SpriteMaterial({
        map: roleTexture,
        transparent: true,
        depthTest: false 
    });
    const roleSprite = new THREE.Sprite(roleMaterial);
    roleSprite.name = "roleLabel";
    roleSprite.scale.set(2.5, 1.25, 1); // Made smaller
    roleSprite.center.set(0.5, 0); 
    roleSprite.position.set(0, 4.0, 0); // Tucked slightly lower
    roleSprite.visible = false;
    group.add(roleSprite);

    // Status Label (for Infected, etc.)
    const statusTexture = createLabelTexture("", "#ffffff");
    const statusMaterial = new THREE.SpriteMaterial({
        map: statusTexture,
        transparent: true,
        depthTest: false 
    });
    const statusSprite = new THREE.Sprite(statusMaterial);
    statusSprite.name = "statusLabel";
    statusSprite.scale.set(2, 1, 1);
    statusSprite.center.set(0.5, 0);
    statusSprite.position.set(0, 5.2, 0); // Above role
    statusSprite.visible = false;
    group.add(statusSprite);

    return group;
};

// Chairs - High Back Executive Style
export const createChair = () => {
    const chairFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a1a0a, // Dark wood color for legs
        roughness: 0.5
    });

    const chairSeatMaterial = new THREE.MeshStandardMaterial({
        map: loadTexture('chair_leather.png'),
        roughness: 0.4
    });

    const chairGroup = new THREE.Group();
    
    const seatWidth = 1.6;
    const seatDepth = 1.6;
    const seatHeight = 1.8; // Surface height
    const backHeight = 2.8;

    // 1. Tapered Wooden Legs
    const legGeo = new THREE.CylinderGeometry(0.12, 0.06, seatHeight - 0.2, 8);
    const legPositions = [
        { x: -seatWidth/2 + 0.3, z: -seatDepth/2 + 0.3 },
        { x: seatWidth/2 - 0.3, z: -seatDepth/2 + 0.3 },
        { x: -seatWidth/2 + 0.3, z: seatDepth/2 - 0.3 },
        { x: seatWidth/2 - 0.3, z: seatDepth/2 - 0.3 },
    ];

    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, chairFrameMaterial);
        leg.position.set(pos.x, (seatHeight - 0.2)/2, pos.z);
        leg.castShadow = true;
        chairGroup.add(leg);
    });

    // 2. Seat Base (Frame)
    const seatBaseGeo = new THREE.BoxGeometry(seatWidth, 0.25, seatDepth);
    const seatBase = new THREE.Mesh(seatBaseGeo, chairFrameMaterial);
    seatBase.position.y = seatHeight - 0.25;
    seatBase.castShadow = true;
    chairGroup.add(seatBase);

    // 3. Plush Seat Cushion
    const cushionGeo = new THREE.BoxGeometry(seatWidth - 0.1, 0.3, seatDepth - 0.1);
    const cushion = new THREE.Mesh(cushionGeo, chairSeatMaterial);
    cushion.position.y = seatHeight;
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    chairGroup.add(cushion);

    // 4. High Backrest with Frame
    const backGroup = new THREE.Group();
    backGroup.position.set(0, seatHeight, -seatDepth/2 + 0.2);
    backGroup.rotation.x = -0.15; // Recline

    // Wood Frame for Back
    const backFrameGeo = new THREE.BoxGeometry(seatWidth, backHeight, 0.2);
    const backFrame = new THREE.Mesh(backFrameGeo, chairFrameMaterial);
    backFrame.position.y = backHeight/2;
    backFrame.castShadow = true;
    backGroup.add(backFrame);

    // Leather Padding for Back
    const backPadGeo = new THREE.BoxGeometry(seatWidth - 0.2, backHeight - 0.2, 0.15);
    const backPad = new THREE.Mesh(backPadGeo, chairSeatMaterial);
    backPad.position.set(0, backHeight/2, 0.15);
    backGroup.add(backPad);

    chairGroup.add(backGroup);

    // 5. Armrests
    const armHeight = 0.9;
    const armLength = seatDepth - 0.3;
    const armWidth = 0.15;

    [-1, 1].forEach(side => {
        const x = side * (seatWidth/2 - 0.1);
        
        // Vertical Support
        const supportGeo = new THREE.CylinderGeometry(0.06, 0.06, armHeight, 8);
        const support = new THREE.Mesh(supportGeo, chairFrameMaterial);
        support.position.set(x, seatHeight + armHeight/2 - 0.2, seatDepth/3); // Front support
        support.rotation.x = 0.2; // Angled forward slightly
        chairGroup.add(support);

        // Armrest Surface
        const armRestGeo = new THREE.BoxGeometry(armWidth, 0.1, armLength);
        const armRest = new THREE.Mesh(armRestGeo, chairFrameMaterial);
        // Position connecting back to front
        armRest.position.set(x, seatHeight + armHeight, 0);
        armRest.castShadow = true;
        chairGroup.add(armRest);
    });

    return chairGroup;
};

export const createEnvironment = (scene, chairCount = 9) => {
    const tableRadius = Math.max(8, chairCount * 0.9);
    const rugRadius = tableRadius + 12;

    // Cleanup old dynamic elements
    const oldTable = scene.getObjectByName('mafiaTable');
    if (oldTable) scene.remove(oldTable);
    const oldRug = scene.getObjectByName('mafiaRug');
    if (oldRug) scene.remove(oldRug);
    const oldTrim = scene.getObjectByName('mafiaRugTrim');
    if (oldTrim) scene.remove(oldTrim);

    // Textures
    const woodTexture = loadTexture('table_wood.png');
    
    woodTexture.repeat.set(2, 1);
    const floorWoodTexture = woodTexture.clone();
    floorWoodTexture.repeat.set(6, 6);

    // Materials
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        map: floorWoodTexture, 
        roughness: 0.8 
    });
    
    const tableMaterial = new THREE.MeshStandardMaterial({ 
        map: woodTexture, 
        roughness: 0.3,
        metalness: 0.1
    });

    // Room Dimensions
    const roomSize = 70;
    const wallHeight = 40;

    // Floor (Static)
    if (!scene.getObjectByName('mafiaFloor')) {
        const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.name = 'mafiaFloor';
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);
    }

    // Circular Red Carpet
    const rugGeo = new THREE.CircleGeometry(rugRadius, 64);
    const rugMat = new THREE.MeshStandardMaterial({ 
        color: 0x8a1a1a, // Deep red
        roughness: 0.9,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.name = 'mafiaRug';
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.05; // Slightly above floor
    rug.receiveShadow = true;
    scene.add(rug);

    // Gold Trim for Carpet
    const trimGeo = new THREE.RingGeometry(rugRadius - 0.5, rugRadius, 64);
    const trimMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700,
        metalness: 0.6,
        roughness: 0.3
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.name = 'mafiaRugTrim';
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 0.06;
    trim.receiveShadow = true;
    scene.add(trim);

    // Walls & Room Structure (Static)
    if (!scene.getObjectByName('mafiaWalls')) {
        const wallGroup = new THREE.Group();
        wallGroup.name = 'mafiaWalls';
        
        const wallTexture = woodTexture.clone();
        wallTexture.wrapS = THREE.RepeatWrapping;
        wallTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.repeat.set(4, 2);
        
        const wallMaterial = new THREE.MeshStandardMaterial({
            map: wallTexture,
            roughness: 0.5,
            side: THREE.FrontSide
        });

        const wallGeo = new THREE.PlaneGeometry(roomSize, wallHeight);

        const backWall = new THREE.Mesh(wallGeo, wallMaterial);
        backWall.position.set(0, wallHeight / 2, -roomSize / 2);
        backWall.receiveShadow = true;
        wallGroup.add(backWall);

        const frontWall = new THREE.Mesh(wallGeo, wallMaterial);
        frontWall.position.set(0, wallHeight / 2, roomSize / 2);
        frontWall.rotation.y = Math.PI;
        frontWall.receiveShadow = true;
        wallGroup.add(frontWall);

        const leftWall = new THREE.Mesh(wallGeo, wallMaterial);
        leftWall.position.set(-roomSize / 2, wallHeight / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.receiveShadow = true;
        wallGroup.add(leftWall);

        const rightWall = new THREE.Mesh(wallGeo, wallMaterial);
        rightWall.position.set(roomSize / 2, wallHeight / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.receiveShadow = true;
        wallGroup.add(rightWall);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), wallMaterial);
        ceiling.position.set(0, wallHeight, 0);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.receiveShadow = true;
        wallGroup.add(ceiling);

        const trimGeometry = new THREE.BoxGeometry(roomSize, 1.5, 0.5);
        const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x110500, roughness: 0.8 });
        
        const backTrim = new THREE.Mesh(trimGeometry, trimMaterial);
        backTrim.position.set(0, 0.75, -roomSize / 2 + 0.25);
        wallGroup.add(backTrim);

        const frontTrim = new THREE.Mesh(trimGeometry, trimMaterial);
        frontTrim.position.set(0, 0.75, roomSize / 2 - 0.25);
        wallGroup.add(frontTrim);

        const leftTrim = new THREE.Mesh(trimGeometry, trimMaterial);
        leftTrim.rotation.y = Math.PI / 2;
        leftTrim.position.set(-roomSize / 2 + 0.25, 0.75, 0);
        wallGroup.add(leftTrim);

        const rightTrim = new THREE.Mesh(trimGeometry, trimMaterial);
        rightTrim.rotation.y = Math.PI / 2;
        rightTrim.position.set(roomSize / 2 - 0.25, 0.75, 0);
        wallGroup.add(rightTrim);

        scene.add(wallGroup);
    }

    // Table
    const tableHeight = 0.2;
    const legHeight = 3;

    const tableGroup = new THREE.Group();
    tableGroup.name = "mafiaTable";

    // Table Top
    const topGeometry = new THREE.CylinderGeometry(tableRadius, tableRadius, tableHeight, 64);
    const top = new THREE.Mesh(topGeometry, tableMaterial);
    top.position.y = legHeight;
    top.castShadow = true;
    top.receiveShadow = true;
    tableGroup.add(top);

    // Table Legs
    const pillarGeometry = new THREE.CylinderGeometry(2, 3, legHeight, 16);
    const pillar = new THREE.Mesh(pillarGeometry, tableMaterial);
    pillar.position.y = legHeight / 2;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    tableGroup.add(pillar);
    
    // Table Base
    const baseGeometry = new THREE.CylinderGeometry(4, 4.5, 0.2, 16);
    const base = new THREE.Mesh(baseGeometry, tableMaterial);
    base.position.y = 0.1;
    base.receiveShadow = true;
    tableGroup.add(base);

    scene.add(tableGroup);
};

export const createPlayers = (scene) => {
    // Determine player count from storage
    const chairCount = parseInt(localStorage.getItem('mafia_total_slots') || '9');
    
    const circleRadius = 13; 
    const players = [];

    // Load custom data
    let customData = {};
    try {
        customData = JSON.parse(localStorage.getItem('mafia_custom_profiles') || '{}');
    } catch(e) { console.error(e); }

    let aiData = {};
    try {
        aiData = JSON.parse(localStorage.getItem('mafia_ai_players') || '{}');
    } catch(e) { console.error(e); }

    for (let i = 0; i < chairCount; i++) {
        const angle = (i / chairCount) * Math.PI * 2;
        
        // Create Chair
        const chair = createChair();
        chair.position.x = Math.cos(angle) * circleRadius;
        chair.position.z = Math.sin(angle) * circleRadius;
        chair.lookAt(0, 0, 0);
        scene.add(chair);

        // Determine Profile
        let profile = null;
        
        // Check for custom override
        if (customData[i]) {
            profile = {
                ...customData[i],
                color: parseInt(customData[i].colorStr || '0xffffff', 16), // ensure color number
                text: customData[i].text || '#ffffff'
            };
            if (!profile.color) profile.color = 0xffffff;
        } else if (i < defaultProfiles.length) {
            profile = defaultProfiles[i];
        } else {
            // Default filler for new slots
            profile = {
                name: `Slot ${i+1}`,
                color: 0xFFFFFF,
                text: '#FFFFFF',
                img: 'avatar_texture.png', // Generic texture
                personality: 'A new challenger.'
            };
        }

        // AI player settings are the source of truth for names and personalities.
        const aiConfig = aiData[i] || null;
        if (aiConfig) {
            profile = {
                ...profile,
                name: aiConfig.name || profile.name,
                personality: aiConfig.personality || profile.personality,
                img: aiConfig.img || profile.img,
                provider: aiConfig.provider || 'gemini',
                model: aiConfig.model || '',
                apiKey: aiConfig.apiKey || '',
                endpoint: aiConfig.endpoint || ''
            };
        }

        // Create Avatar
        const avatar = createAvatar(profile);
        avatar.position.set(0, 5.5, 0);
        

        
        chair.add(avatar);

        players.push({
            id: i,
            name: profile.name,
            color: profile.color,
            img: profile.img,
            personality: profile.personality,
            aiConfig: {
                provider: profile.provider || 'gemini',
                model: profile.model || '',
                apiKey: profile.apiKey || '',
                endpoint: profile.endpoint || ''
            },
            forcedRole: profile.forcedRole || null,
            avatarGroup: avatar,
            chairGroup: chair,
            role: null
        });
    }

    return players;
};

// Compatibility export if needed, though main.js will use new exports
export const createWorld = (scene) => {
    createEnvironment(scene);
    return createPlayers(scene);
};
