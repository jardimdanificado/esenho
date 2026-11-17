#ifndef QUADRO_BRUSH_FOOTPRINT_H
#define QUADRO_BRUSH_FOOTPRINT_H

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
