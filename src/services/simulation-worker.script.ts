export const SIMULATION_WORKER_SCRIPT = `
// --- Self-contained Worker Script for Assalto Arcano ---
'use strict';

// 1. MODELS AND TYPES (from simulation.model.ts)
// Interfaces are compiled away, but good for reference.
// Enums are not used to keep the script simple.

// 2. UTILITIES (from utils/quadtree.ts)
class Quadtree {
    constructor(boundary, capacity = 4) {
        this.points = [];
        this.divided = false;
        this.boundary = boundary;
        this.capacity = capacity;
    }
    subdivide() {
        const { x, y, width, height } = this.boundary;
        const hw = width / 2;
        const hh = height / 2;
        const ne = { x: x + hw, y: y, width: hw, height: hh };
        this.northeast = new Quadtree(ne, this.capacity);
        const nw = { x: x, y: y, width: hw, height: hh };
        this.northwest = new Quadtree(nw, this.capacity);
        const se = { x: x + hw, y: y + hh, width: hw, height: hh };
        this.southeast = new Quadtree(se, this.capacity);
        const sw = { x: x, y: y + hh, width: hw, height: hh };
        this.southwest = new Quadtree(sw, this.capacity);
        this.divided = true;
    }
    insert(point) {
        if (!this.contains(point)) {
            return false;
        }
        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        }
        if (!this.divided) {
            this.subdivide();
        }
        return this.northeast.insert(point) || this.northwest.insert(point) || this.southeast.insert(point) || this.southwest.insert(point);
    }
    query(range, found = []) {
        if (!this.intersects(range)) {
            return found;
        }
        for (const p of this.points) {
            if (range.x <= p.x && p.x < range.x + range.width &&
                range.y <= p.y && p.y < range.y + range.height) {
                found.push(p);
            }
        }
        if (this.divided) {
            this.northwest.query(range, found);
            this.northeast.query(range, found);
            this.southwest.query(range, found);
            this.southeast.query(range, found);
        }
        return found;
    }
    contains(point) {
        return (point.x >= this.boundary.x &&
            point.x < this.boundary.x + this.boundary.width &&
            point.y >= this.boundary.y &&
            point.y < this.boundary.y + this.boundary.height);
    }
    intersects(range) {
        return !(range.x > this.boundary.x + this.boundary.width ||
            range.x + range.width < this.boundary.x ||
            range.y > this.boundary.y + this.boundary.height ||
            range.y + range.height < this.boundary.y);
    }
}

// 3. AI LOGIC (from services/agent-decision.service.ts)
class AgentDecisionService {
    decideBehavior(enemy, playerPosition, enemiesNearby) {
        enemy.behaviorTimeout--;
        if (enemy.behaviorTimeout <= 0) {
            const dx = playerPosition.x - enemy.position.x;
            const dz = playerPosition.y - enemy.position.y;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const rand = Math.random();
            if (distance > 8 && rand < 0.9) {
                enemy.behavior = 'advancing';
                enemy.behaviorTimeout = 180 + Math.floor(Math.random() * 120);
            }
            else if (rand < 0.6) {
                enemy.behavior = 'advancing';
                enemy.behaviorTimeout = 120 + Math.floor(Math.random() * 120);
            }
            else {
                enemy.behavior = 'strafing';
                enemy.strafeDirection = Math.random() < 0.5 ? -1 : 1;
                enemy.behaviorTimeout = 60 + Math.floor(Math.random() * 60);
            }
        }
        return enemy;
    }
}

// 4. SIMULATION CORE (adapted from services/simulation.service.ts)
class SimulationWorkerLogic {
    constructor(assetManifest) {
        this.agentDecisionService = new AgentDecisionService();
        this.playerHealth = 100;
        this.maxPlayerHealth = 100;
        this.playerDamageCooldown = 0;
        this.gameState = 'creation';
        this.initialEnemyCount = 0;
        this.enemies = new Map();
        this.tickCounter = 0;
        this.enemiesDefeated = 0;
        this.worldLength = 80;
        this.worldWidth = 10;
        this.nextEnemyId = 0;
        this.assetManifest = assetManifest;
    }
    
    postStateUpdate() {
        self.postMessage({
            type: 'stateUpdate',
            payload: {
                enemies: Array.from(this.enemies.values()),
                playerHealth: this.playerHealth,
                enemiesDefeated: this.enemiesDefeated,
                tickCounter: this.tickCounter,
            }
        });
    }

    prepareAndStartGame(templates, count) {
        // Reset all core simulation state for a clean restart
        this.playerHealth = this.maxPlayerHealth;
        this.gameState = 'creation'; // Set to 'running' via 'start' message
        this.tickCounter = 0;
        this.enemiesDefeated = 0;
        
        this.initialEnemyCount = count;
        this.nextEnemyId = 0;
        const initialEnemies = new Map();
        for (let i = 0; i < count; i++) {
            const template = templates[i % templates.length];
            const enemy = this._createEnemy(template);
            initialEnemies.set(enemy.id, enemy);
        }
        this.enemies = initialEnemies;
        this.postStateUpdate();
    }
    
    startGame() {
        this.gameState = 'running';
    }

    spawnEnemy(template) {
        const enemy = this._createEnemy(template);
        this.enemies.set(enemy.id, enemy);
    }

    _createEnemy(template) {
        const id = \`enemy_\${this.nextEnemyId++}\`;
        
        const genomeType = template.genomeType;
        const modelUrl = template.modelUrl;

        const defaultGenome = {
            bodySize: 1.0,
            numBuds: 0,
            budSizeVariation: 0,
            color: '#FFFFFF',
            speed: 0.03,
            armor: 0.1,
        };
        return {
            id,
            name: template.name,
            genome: { ...defaultGenome, ...template.genome },
            genomeType,
            modelUrl,
            position: {
                x: (Math.random() - 0.5) * this.worldWidth,
                y: (-this.worldLength / 2) + (Math.random() * 5),
                z: 0,
            },
            age: 0,
            zVelocity: 0,
            health: 100,
            maxHealth: 100,
            statusEffects: [],
            behavior: 'advancing',
            behaviorTimeout: 120 + Math.floor(Math.random() * 120),
            strafeDirection: Math.random() < 0.5 ? -1 : 1,
        };
    }
    
    damageEnemy({ id, damage, effect }) {
        const enemy = this.enemies.get(id);
        if (enemy) {
            const damageTaken = damage * (1 - (enemy.genome.armor || 0));
            enemy.health = Math.max(0, enemy.health - damageTaken);
            if (effect) {
                if (!enemy.statusEffects.some(se => se.type === effect.type)) {
                   enemy.statusEffects.push({ ...effect, startTime: this.tickCounter });
                }
            }
            this.enemies.set(id, enemy);
        }
    }

    applyAreaEffect({ position, radius, effect }) {
        const radiusSq = radius * radius;
        for (const enemy of this.enemies.values()) {
            const dx = enemy.position.x - position.x;
            const dy = enemy.position.y - position.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq <= radiusSq) {
                if (!enemy.statusEffects.some(se => se.type === effect.type)) {
                    enemy.statusEffects.push({ ...effect, startTime: this.tickCounter });
                }
            }
        }
    }

    damagePlayer(amount) {
        this.playerHealth = Math.max(0, this.playerHealth - amount);
    }
    
    tick(playerPosition) {
        if (this.gameState !== 'running') return;
        this.tickCounter++;

        if (this.playerDamageCooldown > 0) {
            this.playerDamageCooldown--;
        }

        const bounds = { x: -this.worldWidth / 2, y: -this.worldLength / 2, width: this.worldWidth, height: this.worldLength };
        const quadtree = new Quadtree(bounds);
        for (const enemy of this.enemies.values()) {
            quadtree.insert({ x: enemy.position.x, y: enemy.position.y, id: enemy.id });
        }
        
        const defeatedEnemies = new Set();
        
        for (let enemy of this.enemies.values()) {
            // --- Process status effects first ---
            if (enemy.statusEffects.length > 0) {
                for (const effect of enemy.statusEffects) {
                    switch (effect.type) {
                        case 'burning':
                            if (effect.damagePerTick) enemy.health -= effect.damagePerTick;
                            break;
                        case 'gravity':
                            if (effect.center && effect.force) {
                                const gx = effect.center.x - enemy.position.x;
                                const gy = effect.center.y - enemy.position.y;
                                const gDist = Math.sqrt(gx * gx + gy * gy);
                                if (gDist > 0.5) {
                                    enemy.position.x += (gx / gDist) * effect.force;
                                    enemy.position.y += (gy / gDist) * effect.force;
                                }
                            }
                            break;
                    }
                }
                enemy.statusEffects = enemy.statusEffects.filter(
                    effect => (this.tickCounter - effect.startTime) < effect.duration
                );
            }

            // --- Check for defeat from effects ---
            if (enemy.health <= 0) {
                defeatedEnemies.add(enemy.id);
                continue;
            }

            // --- AI and Movement Logic ---
            const nearbyEnemies = quadtree.query({ x: enemy.position.x - 5, y: enemy.position.y - 5, width: 10, height: 10 })
                .map(p => this.enemies.get(p.id)).filter(Boolean);
            
            enemy = this.agentDecisionService.decideBehavior(enemy, playerPosition, nearbyEnemies);

            const dx = playerPosition.x - enemy.position.x;
            const dz = playerPosition.y - enemy.position.y;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // --- Attack and Knockback Logic ---
            if (distance < 1.5) {
                if (this.playerDamageCooldown <= 0) {
                    this.damagePlayer(10);
                    this.playerDamageCooldown = 30; // 0.5 sec cooldown at 60tps
                }

                const knockbackDistance = 2.5;
                if (distance > 0.01) {
                    enemy.position.x -= (dx / distance) * knockbackDistance;
                    enemy.position.y -= (dz / distance) * knockbackDistance;
                }

                enemy.behavior = 'strafing';
                enemy.strafeDirection = Math.random() < 0.5 ? -1 : 1;
                enemy.behaviorTimeout = 90 + Math.floor(Math.random() * 60);
                
                continue; // Skip normal movement for this tick
            }
            
            // --- Regular Movement Logic (No longer freezes) ---
            if (distance > 0.01) { // Safety check to prevent division by zero (NaN bug)
                const moveSpeed = enemy.genome.speed;
                switch (enemy.behavior) {
                    case 'advancing':
                        enemy.position.x += (dx / distance) * moveSpeed;
                        enemy.position.y += (dz / distance) * moveSpeed;
                        break;
                    case 'strafing':
                        const len = Math.sqrt(dz*dz + (-dx)*(-dx));
                        if (len > 0.01) {
                            const strafeDirX = dz / len;
                            const strafeDirZ = -dx / len;
                            enemy.position.x += strafeDirX * moveSpeed * 0.7 * enemy.strafeDirection;
                            enemy.position.y += strafeDirZ * moveSpeed * 0.7 * enemy.strafeDirection;
                        }
                        break;
                }
            }
            
            // --- Boundary checks ---
            const halfWidth = this.worldWidth / 2 + 0.5;
            enemy.position.x = Math.max(-halfWidth, Math.min(halfWidth, enemy.position.x));
            if (enemy.position.y > this.worldLength / 2 + 2) {
                defeatedEnemies.add(enemy.id); // De-spawn if they go past the player
            }
            enemy.age++;
        }
        
        // --- Process defeated enemies ---
        if (defeatedEnemies.size > 0) {
            defeatedEnemies.forEach(id => {
                this.enemies.delete(id);
                self.postMessage({ type: 'requestReinforcement' });
            });
            this.enemiesDefeated += defeatedEnemies.size;
        }
        
        // --- Check game over condition ---
        if (this.playerHealth <= 0) {
            this.gameState = 'lost';
            self.postMessage({ type: 'gameStateUpdate', payload: 'lost' });
        }
        
        this.postStateUpdate();
    }
}

// 5. WORKER MESSAGE HANDLER
let simulation = null;
self.onmessage = (e) => {
    const { type, payload } = e.data;
    switch (type) {
        case 'init':
            simulation = new SimulationWorkerLogic(payload.assetManifest);
            break;
        case 'prepare':
            simulation.prepareAndStartGame(payload.templates, payload.count);
            break;
        case 'start':
            simulation.startGame();
            break;
        case 'tick':
            simulation.tick(payload);
            break;
        case 'damageEnemy':
            simulation.damageEnemy(payload);
            break;
        case 'applyAreaEffect':
            simulation.applyAreaEffect(payload);
            break;
        case 'spawnEnemy':
            simulation.spawnEnemy(payload);
            break;
    }
};
`