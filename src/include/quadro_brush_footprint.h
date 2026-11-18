#ifndef QUADRO_BRUSH_FOOTPRINT_H
#define QUADRO_BRUSH_FOOTPRINT_H

/* A half-pixel square under the tangent of a broad circular tip. The
 * piecewise quadratic area keeps diagonal coverage smooth with one square
 * root; narrow tips retain the full ellipse integrator below. */
static inline float w_tip_circle_sample(float dx, float dy, float radius) {
    float distance=__builtin_sqrtf(dx*dx+dy*dy);
    if (distance==0) return 1;
    float a=__builtin_fabsf(dx)*0.5f/distance;
    float b=__builtin_fabsf(dy)*0.5f/distance;
    if (b>a) { float swap=a; a=b; b=swap; }
    float edge=radius-distance+(a+b)*0.5f;
    if (edge<=0) return 0;
    if (edge>=a+b) return 1;
    if (edge<b) return edge*edge/(2*a*b);
    if (edge<a) return (edge-b*0.5f)/a;
    edge=a+b-edge;
    return 1-edge*edge/(2*a*b);
}

/* Integrate an ellipse's vertical spans across a pixel. Sampling only points
 * can entirely miss a hairline nib. Clip the integration interval to the
 * projected ellipse first, so even subpixel widths contribute their area. */
static inline float w_tip_ellipse_coverage(float dx, float dy, float rx, float ry, float cs, float sn) {
    float ix=1/(rx*rx), iy=1/(ry*ry);
    float c=sn*sn*ix+cs*cs*iy;
    float b=cs*sn*(ix-iy);
    float schur=ix*iy/c;
    float extent=__builtin_sqrtf(rx*rx*cs*cs+ry*ry*sn*sn);
    float left=dx-0.5f, right=dx+0.5f;
    if (left < -extent) left=-extent;
    if (right > extent) right=extent;
    if (right <= left) return 0;
    float step=(right-left)*0.125f, area=0;
    for (int i=0; i<8; ++i) {
        float x=left+(i+0.5f)*step;
        float q=1-schur*x*x;
        if (q<=0) continue;
        float center=-b*x/c, half=__builtin_sqrtf(q/c);
        float top=center-half, bottom=center+half;
        if (top < dy-0.5f) top=dy-0.5f;
        if (bottom > dy+0.5f) bottom=dy+0.5f;
        if (bottom>top) area+=(bottom-top)*step;
    }
    return area > 1 ? 1 : area;
}
#endif
