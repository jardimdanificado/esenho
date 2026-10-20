import app.esenho.nativeengine.BrushResponseCurve;
import app.esenho.nativeengine.BrushCurveInputs;
import app.esenho.nativeengine.BrushParameterScope;

public class BrushResponseCurveTest {
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void close(float actual, float expected) { check(Math.abs(actual-expected) < .0001, actual+" != "+expected); }
    public static void main(String[] args) {
        float[] x = {0, .2f, .6f, 1}, y = {0, .7f, .8f, 1};
        var smooth = new BrushResponseCurve(x,y,"smooth");
        x[1]=.9f; y[1]=0;
        close(smooth.valueAt(.2f), .7f); // Editing another curve cannot mutate a saved evaluator.
        float previous = 0;
        for (int i=0; i<=1000; i++) {
            float v=smooth.valueAt(i/1000f);
            check(v >= previous-.00001 && v <= 1, "Smooth monotone curves must not overshoot"); previous=v;
        }
        close(smooth.valueAt(-10),0); close(smooth.valueAt(10),1); close(smooth.valueAt(Float.NaN),0);
        var wave = new BrushResponseCurve(new float[]{0,.25f,.5f,.75f,1}, new float[]{.5f,1,.5f,0,.5f},"smooth");
        for (int i=0;i<=1000;i++) check(wave.valueAt(i/1000f)>=0 && wave.valueAt(i/1000f)<=1,"Nonmonotone curves stay bounded");
        close(wave.valueAt(.25f),1); close(wave.valueAt(.75f),0);
        var steps = new BrushResponseCurve(new float[]{0,.33f,.66f,1},new float[]{0,.5f,1,1},"steps");
        close(steps.valueAt(.329f),0); close(steps.valueAt(.33f),.5f); close(steps.valueAt(.66f),1);
        close(BrushResponseCurve.mapOutput(.5f,.1f,.9f,1,100,false),50.5f);
        close(BrushResponseCurve.mapOutput(1,.1f,.9f,0,4,true),4);
        close(BrushResponseCurve.mapOutput(.8f,0,1,0,1,true),1);
        close(BrushResponseCurve.mapOutput(.2f,0,1,0,1,true),0);
        close(BrushResponseCurve.mapOutput(0,1,0,0,100,false),100);
        boolean invalid=false;
        try { new BrushResponseCurve(new float[]{0,.5f,.5f,1},new float[]{0,0,1,1},"smooth"); }
        catch(IllegalArgumentException expected) {invalid=true;}
        check(invalid,"Duplicate knots must not divide by zero");

        var inputs = new BrushCurveInputs();
        inputs.begin(0,0,.25f,0,0,100);
        inputs.dab(0,0); inputs.dab(50,0);
        close(inputs.value("pressure",1,false,0),.25f);
        close(inputs.value("distance",100,false,0),.5f);
        inputs.dab(150,0); close(inputs.value("distance",100,true,0),.5f);
        close(inputs.value("distance",100,false,0),1);
        inputs.event(100,0,.75f,90,0,101);
        close(inputs.value("time",2,false,0),.5f); close(inputs.value("tilt",1,false,0),1);
        close(inputs.value("pressure",1,false,0),.75f);
        check(inputs.value("speed",1000,false,0)>.09 && inputs.value("speed",1000,false,0)<.11,"Velocity uses event time");
        float speed=inputs.value("speed",1000,false,0);
        for(int i=0;i<100;i++) inputs.dab(150+i,0);
        close(inputs.value("speed",1000,false,0),speed); // Bezier subdivisions do not make velocity explode.
        float a=inputs.value("noise",80,false,12), b=inputs.value("noise",80,false,12);
        close(a,b);
        inputs.begin(0,0,.2f,0,0,200); inputs.dab(0,0);
        close(inputs.value("distance",100,false,0),0); close(inputs.value("time",2,false,0),0);
        float last=inputs.value("noise",100,false,0);
        for(int i=1;i<100;i++) { inputs.dab(i*.1f,0); float next=inputs.value("noise",100,false,0); check(Math.abs(next-last)<.01,"Noise is continuous");last=next; }
        check(BrushParameterScope.matches("wasm:graphite_pencil","Graphite Load","graphite_pencil",10001,"Graphite Load"),"A curve can own a procedural property");
        check(!BrushParameterScope.matches("wasm:graphite_pencil","Graphite Load","soft_pastel",10001,"Pigment Load"),"Curves must not leak across kernels");
        System.out.println("Reusable brush curves: smooth/linear/step response, discrete outputs, input timing, cycles, noise and scope isolation passed.");
    }
}
