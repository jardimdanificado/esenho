#ifndef QUADRO_BRUSH_GRID_H
#define QUADRO_BRUSH_GRID_H
#include "quadro_brush_plugin.h"

/* Resolve simulation cells by their area on the canvas, not a single cell
 * under each pixel center. Tiny grids still contribute their actual pattern
 * energy even when individual structures are smaller than one pixel. */
static void w_brush_resolve_grid(uint32_t *pixels, int w, int h, float cx, float cy,
        float radius, const float *grid, int size, float extent,
        uint32_t color, int eraser, int additive) {
    float cell = 2*extent/size;
    int x0, y0, x1, y1;
    w_brush_compute_bounds((int)cx, (int)cy, (int)(extent+2), w, h, &x0, &y0, &x1, &y1);
    for (int y=y0; y<y1; ++y) for (int x=x0; x<x1; ++x) {
        float left = x-0.5f-(cx-extent), top = y-0.5f-(cy-extent);
        int gx0 = (int)w_floorf(left/cell), gy0 = (int)w_floorf(top/cell);
        int gx1 = (int)w_floorf((left+1)/cell), gy1 = (int)w_floorf((top+1)/cell);
        if (gx0 < 0) gx0=0;
        if (gy0 < 0) gy0=0;
        if (gx1 >= size) gx1=size-1;
        if (gy1 >= size) gy1=size-1;
        float coverage=0;
        for (int gy=gy0; gy<=gy1; ++gy) for (int gx=gx0; gx<=gx1; ++gx) {
            float value=grid[gy*size+gx];
            if (!(value > 0)) continue;
            float l=gx*cell > left ? gx*cell : left;
            float t=gy*cell > top ? gy*cell : top;
            float r=(gx+1)*cell < left+1 ? (gx+1)*cell : left+1;
            float b=(gy+1)*cell < top+1 ? (gy+1)*cell : top+1;
            float dx=(gx+0.5f)*cell-extent, dy=(gy+0.5f)*cell-extent;
            float profile=w_brush_falloff_smooth(dx*dx+dy*dy, 1/(radius*radius));
            if (r>l && b>t) coverage += (r-l)*(b-t)*value*profile;
        }
        if (coverage > 1) coverage=1;
        uint32_t a=(uint32_t)(coverage*255+0.5f);
        if (!a) continue;
        uint32_t *dst=&pixels[y*w+x];
        *dst=eraser ? w_brush_erase(*dst,color,a)
            : additive ? w_brush_blend_add(color,*dst,a) : w_brush_blend_over(color,*dst,a);
    }
}
#endif
