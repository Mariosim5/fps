export interface Point {
    x: number;
    y: number;
    id?: string;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class Quadtree {
    private capacity: number;
    private boundary: Rectangle;
    private points: Point[] = [];
    private divided: boolean = false;
    private northeast!: Quadtree;
    private northwest!: Quadtree;
    private southeast!: Quadtree;
    private southwest!: Quadtree;

    constructor(boundary: Rectangle, capacity: number = 4) {
        this.boundary = boundary;
        this.capacity = capacity;
    }

    private subdivide(): void {
        const { x, y, width, height } = this.boundary;
        const hw = width / 2;
        const hh = height / 2;

        // FIX: Replace `new Rectangle(...)` with object literals, as Rectangle is an interface.
        const ne = { x: x + hw, y: y, width: hw, height: hh };
        this.northeast = new Quadtree(ne, this.capacity);
        // FIX: Replace `new Rectangle(...)` with object literals, as Rectangle is an interface.
        const nw = { x: x, y: y, width: hw, height: hh };
        this.northwest = new Quadtree(nw, this.capacity);
        // FIX: Replace `new Rectangle(...)` with object literals, as Rectangle is an interface.
        const se = { x: x + hw, y: y + hh, width: hw, height: hh };
        this.southeast = new Quadtree(se, this.capacity);
        // FIX: Replace `new Rectangle(...)` with object literals, as Rectangle is an interface.
        const sw = { x: x, y: y + hh, width: hw, height: hh };
        this.southwest = new Quadtree(sw, this.capacity);

        this.divided = true;
    }

    insert(point: Point): boolean {
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

        return this.northeast.insert(point) ||
               this.northwest.insert(point) ||
               this.southeast.insert(point) ||
               this.southwest.insert(point);
    }

    query(range: Rectangle, found: Point[] = []): Point[] {
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
    
    private contains(point: Point): boolean {
        return (point.x >= this.boundary.x &&
                point.x < this.boundary.x + this.boundary.width &&
                point.y >= this.boundary.y &&
                point.y < this.boundary.y + this.boundary.height);
    }

    private intersects(range: Rectangle): boolean {
        return !(range.x > this.boundary.x + this.boundary.width ||
                 range.x + range.width < this.boundary.x ||
                 range.y > this.boundary.y + this.boundary.height ||
                 range.y + range.height < this.boundary.y);
    }
}
