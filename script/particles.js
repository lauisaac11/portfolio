const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");

// 取消抗鋸齒，保留像素的銳利邊緣
ctx.imageSmoothingEnabled = false;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];
let mouse = {
    x: null,
    y: null,
    radius: 120
}

window.addEventListener('mousemove', function(event) {
    mouse.x = event.x;
    mouse.y = event.y;
});

window.addEventListener('mouseout', function() {
    mouse.x = null;
    mouse.y = null;
});

window.addEventListener('resize', function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false; // 調整尺寸後需再次設置
    init();
});

class Particle {
    constructor(x, y, directionX, directionY, size, color) {
        this.x = x;
        this.y = y;
        this.directionX = directionX;
        this.directionY = directionY;
        this.size = size;
        this.color = color;
    }
    
    draw() {
        ctx.fillStyle = this.color;
        // 改回平滑移動，只做基礎捨去小數點，避免人為刻意的跳動卡頓感
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
    }
    
    update() {
        this.x += this.directionX;
        this.y += this.directionY;
        
        // 碰到邊界直接穿梭到另一面（復古遊戲場景特徵），而不是反彈
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
        
        // 鼠標推開效果 (魔法干擾區)
        if (mouse.x != null && mouse.y != null) {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < mouse.radius) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (mouse.radius - distance) / mouse.radius;
                // 鼠標排斥力加快一點，讓像素被彈開的感覺更活潑
                this.x -= forceDirectionX * force * 4;
                this.y -= forceDirectionY * force * 4;
            }
        }
        
        this.draw();
    }
}

function init() {
    particlesArray = [];
    // 數量調回來一點，因為去掉了連線，需要更多方塊點綴
    let numberOfParticles = (canvas.height * canvas.width) / 12000;
    
    // 預設復古方塊尺寸，限制為特定比例 (例如 4, 8, 12 px)
    const sizes = [4, 8, 12];
    const alphas = [0.15, 0.3, 0.6]; // 三種層級的透明度，營造遠近景
    
    for (let i = 0; i < numberOfParticles; i++) {
        let size = sizes[Math.floor(Math.random() * sizes.length)];
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        
        // 給他們一致的緩慢漂移方向（有點像斜落下的數位雪花 / 星空）
        let directionX = (Math.random() * 0.4) - 0.2; 
        let directionY = (Math.random() * 0.3) + 0.1; // 大部分往下掉
        
        let alpha = alphas[Math.floor(Math.random() * alphas.length)];
        let color = `rgba(255, 255, 255, ${alpha})`;
        
        particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
    }
}

function animate() {
    requestAnimationFrame(animate);
    // 可加點殘影或直接刷清
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
    }
}

init();
animate();
