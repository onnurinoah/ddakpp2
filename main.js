// main.js 파일 내용

// --- 0. Pixi.js 애플리케이션 초기화 ---
const appContainer = document.getElementById('app-container');
const WIDTH = 1280; // 내부 해상도 기준
const HEIGHT = 720; 

const app = new PIXI.Application({
    width: WIDTH,
    height: HEIGHT,
    background: 0x000000,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
});

appContainer.appendChild(app.view);

// 캔버스의 그라데이션 배경 설정
const background = new PIXI.Graphics();
background.beginRadialFill([0x512b58, 0x2c1055, 0x000000], [0, 0.4, 1], WIDTH / 2, HEIGHT, HEIGHT * 0.5);
background.drawRect(0, 0, WIDTH, HEIGHT);
background.endFill();
app.stage.addChild(background);

// --- 1. Firebase 및 테스트 변수 설정 ---
const startTestBtn = document.getElementById('start-test-btn');
const clearBtn = document.getElementById('clear-btn');
const counterElement = document.getElementById('counter');

const MAX_EMOJIS = 1500; // Pixi.js는 DOM보다 훨씬 많은 요소를 처리할 수 있습니다.
let activeEmojis = []; // 현재 화면에 보이는 이모지 객체 리스트

// Firebase 초기화 및 오류 방지
let db = null;
try {
    if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    }
} catch(e) { 
    console.warn("Firebase 초기화 실패. 시뮬레이션만 작동합니다.", e);
}

// 상자 이미지 로드 (텍스처로 사용)
const chestTexture = PIXI.Texture.from('./chest_3d.png');
const CHEST_POS_Y = HEIGHT * 0.75;
const CHEST_WIDTH = WIDTH * 0.35; // 캔버스 내부 해상도 기준

const chest = new PIXI.Sprite(chestTexture);
chest.anchor.set(0.5, 0.5);
chest.x = WIDTH / 2;
chest.y = CHEST_POS_Y;
chest.width = CHEST_WIDTH;
chest.height = CHEST_WIDTH * (chestTexture.height / chestTexture.width); // 비율 유지

// 캔버스 깊이감 설정 (상자보다 앞에 이모지가 쌓이도록)
const pileLayer = new PIXI.Container();
pileLayer.zIndex = 100;

app.stage.addChild(chest); // 상자는 뒤에 배치 (zIndex 0)
app.stage.addChild(pileLayer); // 이모지는 앞에 배치 (zIndex 100)
app.stage.sortableChildren = true; // Z-Index를 사용하기 위해 필요

// --- 2. 이모지 스프라이트 생성 및 속성 정의 ---
// 이모지 텍스트를 Pixi.js 텍스처로 변환하는 함수
function getEmojiTexture(emojiChar) {
    const style = new PIXI.TextStyle({
        fontSize: 100,
        fill: 0xFFFFFF,
        fontFamily: 'Noto Color Emoji, sans-serif',
        // 텍스트 그림자는 성능 문제로 인해 최소화
    });
    const texture = app.renderer.generateTexture(new PIXI.Text(emojiChar, style));
    return texture;
}

// 실제 이모지 객체 생성
function createEmojiSprite(emojiChar, isLanded = false) {
    const texture = getEmojiTexture(emojiChar);
    const sprite = new PIXI.Sprite(texture);

    sprite.anchor.set(0.5);
    sprite.x = WIDTH / 2;
    sprite.y = HEIGHT;
    sprite.scale.set(0.3); // 기본 크기

    // 이모지의 동적 속성
    sprite.isFlying = !isLanded;
    sprite.velocity = new PIXI.Point(0, 0);
    sprite.landingTime = 0;
    
    // 최종 착지 위치 (캔버스 좌표)
    let finalX = (Math.random() - 0.5) * 2;
    finalX = finalX * finalX * finalX * 1.5; 
    sprite.finalX = WIDTH / 2 + finalX * 150;
    
    let finalY = (Math.random() * 0.25) + 0.65;
    finalY = HEIGHT * finalY;
    sprite.finalY = finalY;

    // 초기 애니메이션 설정
    if (sprite.isFlying) {
        sprite.velocity.x = (sprite.finalX - sprite.x) * 0.05 + (Math.random() - 0.5) * 5;
        sprite.velocity.y = -25; // 초기 위로 솟아오르는 힘
        sprite.gravity = 1.0;
        sprite.rotationSpeed = (Math.random() - 0.5) * 0.1;
        sprite.landingTime = performance.now() + 1000; // 1초 후 착지 예정
        sprite.alpha = 0; // 시작 시 투명
    } else {
        // 과거 데이터: 바로 착지 위치에 고정
        sprite.x = sprite.finalX;
        sprite.y = sprite.finalY;
        sprite.texture = getEmojiTexture('❤️'); // 바로 하트 모양
    }

    // 깊이감 (쌓이는 효과): Y축 값이 클수록(화면 아래) Z-Index가 높아야 앞에 보임
    sprite.zIndex = Math.floor(sprite.y); 

    pileLayer.addChild(sprite);
    activeEmojis.push(sprite);
    return sprite;
}

// --- 3. 메인 게임 루프 (애니메이션 처리) ---
app.ticker.add((delta) => {
    // 큐 처리
    processQueue();

    const now = performance.now();

    for (let i = activeEmojis.length - 1; i >= 0; i--) {
        const sprite = activeEmojis[i];

        if (sprite.isFlying) {
            // 날아가는 애니메이션
            sprite.velocity.y += sprite.gravity * delta * 0.1;
            sprite.x += sprite.velocity.x * delta * 0.5;
            sprite.y += sprite.velocity.y * delta * 0.5;
            sprite.rotation += sprite.rotationSpeed * delta;
            sprite.alpha = Math.min(1, sprite.alpha + 0.05 * delta); // 페이드 인

            // 착지 조건 검사
            if (sprite.y > sprite.finalY || now > sprite.landingTime) {
                // 착지 완료
                sprite.isFlying = false;
                sprite.x = sprite.finalX;
                sprite.y = sprite.finalY;
                sprite.rotation = (Math.random() - 0.5) * 0.3; // 최종 각도 고정
                sprite.texture = getEmojiTexture('❤️'); // 하트 변신 (텍스처 교체)
                
                // 깊이감 업데이트 (최종 Y 위치 기준)
                sprite.zIndex = Math.floor(sprite.finalY + Math.random() * 5); 
                pileLayer.sortChildren(); // 깊이 정렬
            }
        }
    }

    // 이모지 개수 제한 (가장 오래된 것 제거)
    while (activeEmojis.length > MAX_EMOJIS) {
        const oldestSprite = activeEmojis.shift();
        oldestSprite.destroy();
    }

    counterElement.innerText = `${activeEmojis.length}/${MAX_EMOJIS}`;
});

// --- 4. Firebase 리스너 및 배치 처리 (DOM 코드와 유사) ---
let itemQueue = [];
let isProcessingQueue = false;

function startListening() {
    if (!db) return;
    // ... (Firebase 데이터 로직은 이전과 동일하게 유지) ...
    // 다만, spawnItem 대신 itemQueue.push({ emoji: ..., isLanded: false }) 사용
}

if (db) {
    // startListening(); // 실제 배포 시 주석 해제
}

function processQueue() {
    if (itemQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }

    isProcessingQueue = true;
    const batchSize = Math.min(itemQueue.length, 50); // 한 번에 최대 50개 처리
    const batch = itemQueue.splice(0, batchSize);

    batch.forEach(itemData => {
        createEmojiSprite(itemData.emoji, itemData.isLanded);
    });

    // 큐에 데이터가 남아있으면 다음 틱에 계속 처리 요청
    if (itemQueue.length > 0) {
        requestAnimationFrame(processQueue); // 다음 프레임에 처리
    } else {
        isProcessingQueue = false;
    }
}


// --- 5. 시뮬레이션 버튼 로직 ---
let spawnCount = 0;
let spawnInterval = null;
const TOTAL_TO_SPAWN = 1000;

function startSimulation() {
    if (spawnInterval) return;

    startTestBtn.disabled = true;
    clearBtn.disabled = true;
    spawnCount = 0;
    const emojis = ["🔥", "✨", "🎁", "💎", "⭐️"];

    const intervalFn = () => {
        const numToSpawn = Math.round(TOTAL_TO_SPAWN / 60); 

        for (let i = 0; i < numToSpawn && spawnCount < TOTAL_TO_SPAWN; i++) {
            const pick = emojis[Math.floor(Math.random() * emojis.length)];
            itemQueue.push({ emoji: pick, isLanded: false });
            spawnCount++;
        }

        // 큐 처리기 호출
        if (!isProcessingQueue) {
            requestAnimationFrame(processQueue);
        }

        if (spawnCount >= TOTAL_TO_SPAWN) {
            clearInterval(spawnInterval);
            spawnInterval = null;
            startTestBtn.disabled = false;
            clearBtn.disabled = false;
            startTestBtn.innerText = "✅ 시뮬레이션 완료";
            setTimeout(() => {
                startTestBtn.innerText = "⚡ 1분간 1000개 발사 시뮬레이션";
            }, 3000);
        }
    };
    
    spawnInterval = setInterval(intervalFn, 1000); 
    startTestBtn.innerText = "⏳ 발사 중...";
}

startTestBtn.addEventListener('click', startSimulation);

clearBtn.addEventListener('click', () => {
    if (spawnInterval) {
         clearInterval(spawnInterval);
         spawnInterval = null;
    }
    // 모든 Pixi.js 스프라이트 제거
    activeEmojis.forEach(e => e.destroy());
    activeEmojis = [];
    itemQueue = [];
    isProcessingQueue = false;
    spawnCount = 0;
    counterElement.innerText = `0/${MAX_EMOJIS}`;
    startTestBtn.disabled = false;
    startTestBtn.innerText = "⚡ 1분간 1000개 발사 시뮬레이션";
    clearBtn.disabled = false;
});

counterElement.innerText = `0/${MAX_EMOJIS}`;
// 캔버스 크기 조절 (반응형)
window.onresize = () => {
    const parent = appContainer.parentElement;
    app.renderer.resize(parent.clientWidth, parent.clientHeight);
    // 내부 해상도 유지
    app.view.style.width = appContainer.style.width; 
    app.view.style.height = appContainer.style.height;
};
window.dispatchEvent(new Event('resize')); // 초기 실행
