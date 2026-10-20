package app.esenho.nativeengine;

/** Input events determine velocity; render subdivisions only determine distance. */
public final class BrushCurveInputs {
    private float x, y, dabX, dabY, pressure, tilt, direction, speed, distance;
    private double startedAt, lastAt, elapsed;
    private int strokeSeed;
    private boolean hasDab;

    public void begin(float x, float y, float pressure, float tiltX, float tiltY, double seconds) {
        this.x=x; this.y=y; this.startedAt=seconds; this.lastAt=seconds;
        speed=distance=direction=0; elapsed=0; hasDab=false;
        strokeSeed = hash(strokeSeed + 0x9e3779b9);
        this.pressure=clamp(pressure);
        tilt=clamp((float)Math.hypot(tiltX, tiltY)/90f);
    }
    public void event(float x, float y, float pressure, float tiltX, float tiltY, double seconds) {
        float dx=x-this.x, dy=y-this.y;
        float d=(float)Math.hypot(dx,dy);
        double dt=Math.max(.001, seconds-lastAt);
        float velocity=Math.min(20000, d/(float)dt);
        speed += (velocity-speed)*(float)(1-Math.exp(-dt/.045));
        if (d > .01f) direction=(float)((Math.atan2(dy,dx)/(2*Math.PI)+1)%1);
        this.x=x; this.y=y; this.lastAt=seconds;
        elapsed=Math.max(0, seconds-startedAt);
        this.pressure=clamp(pressure);
        tilt=clamp((float)Math.hypot(tiltX,tiltY)/90f);
    }
    public void dab(float x, float y) {
        if (hasDab) distance += (float)Math.hypot(x-dabX,y-dabY);
        dabX=x; dabY=y; hasDab=true;
    }
    public float value(String input, float scale, boolean repeat, int salt) {
        scale=Math.max(.001f, scale);
        switch (input) {
            case "speed": return clamp(speed/scale);
            case "distance": return phase(distance/scale,repeat);
            case "time": return phase((float)elapsed/scale,repeat);
            case "tilt": return tilt;
            case "direction": return direction;
            case "noise": {
                float p=distance/scale;
                int i=(int)Math.floor(p);
                float t=p-i; t=t*t*(3-2*t);
                float a=random(i,strokeSeed^salt), b=random(i+1,strokeSeed^salt);
                return a+(b-a)*t;
            }
            default: return pressure;
        }
    }
    private static float phase(float value, boolean repeat) { return repeat ? value-(float)Math.floor(value) : clamp(value); }
    private static float clamp(float v) { return Float.isFinite(v) ? Math.max(0,Math.min(1,v)) : 0; }
    private static int hash(int v) { v^=v>>>16; v*=0x7feb352d; v^=v>>>15; v*=0x846ca68b; return v^(v>>>16); }
    private static float random(int index,int seed) { return (hash(index^seed)&65535)/65535f; }
}
