#ifndef QUADRO_VIEWPORT_FILTER_H
#define QUADRO_VIEWPORT_FILTER_H
#include <stdint.h>
#include <stddef.h>

/* Box integration of premultiplied RGBA. Every source pixel contributes its
 * area, including odd image edges; channels and alpha use identical weights.
 * The destination rectangle is inclusive and supports padded bitmap rows. */
static void w_viewport_reduce(const uint32_t *src, int sw, int sh,
        uint32_t *dst, int dw, int dh, size_t stride,
        int x0, int y0, int x1, int y1) {
    if (!src || !dst || sw<1 || sh<1 || dw<1 || dh<1) return;
    double scale_x=(double)sw/dw, scale_y=(double)sh/dh;
    if (x0<0) x0=0;
    if (y0<0) y0=0;
    if (x1>=dw) x1=dw-1;
    if (y1>=dh) y1=dh-1;
    // Native zoom levels usually divide the document exactly. Their box
    // weights are all one, so avoid floating point weights per source texel.
    if (sw%dw==0 && sh%dh==0) {
        int nx=sw/dw, ny=sh/dh;
        uint64_t count=(uint64_t)nx*ny;
        for (int y=y0; y<=y1; ++y) {
            uint32_t *row=(uint32_t*)((uint8_t*)dst+(size_t)y*stride);
            for (int x=x0; x<=x1; ++x) {
                uint64_t red=0, green=0, blue=0, alpha=0;
                for (int sy=y*ny; sy<(y+1)*ny; ++sy) {
                    const uint32_t *source=src+(size_t)sy*sw+x*nx;
                    for (int sx=0; sx<nx; ++sx) {
                        uint32_t p=source[sx];
                        red+=p&255; green+=(p>>8)&255;
                        blue+=(p>>16)&255; alpha+=p>>24;
                    }
                }
                row[x]=(uint32_t)((red+count/2)/count)
                    | (uint32_t)((green+count/2)/count)<<8
                    | (uint32_t)((blue+count/2)/count)<<16
                    | (uint32_t)((alpha+count/2)/count)<<24;
            }
        }
        return;
    }
    for (int y=y0; y<=y1; ++y) {
        double top=y*scale_y, bottom=(y+1)*scale_y;
        uint32_t *row=(uint32_t*)((uint8_t*)dst+(size_t)y*stride);
        for (int x=x0; x<=x1; ++x) {
            double left=x*scale_x, right=(x+1)*scale_x;
            double sums[4]={0,0,0,0};
            for (int sy=(int)top; sy<sh && sy<bottom; ++sy) {
                double t=sy>top ? sy : top, b=sy+1<bottom ? sy+1 : bottom;
                for (int sx=(int)left; sx<sw && sx<right; ++sx) {
                    double l=sx>left ? sx : left, r=sx+1<right ? sx+1 : right;
                    double weight=(r-l)*(b-t);
                    uint32_t p=src[(size_t)sy*sw+sx];
                    for (int c=0; c<4; ++c) sums[c]+=((p>>(c*8))&255)*weight;
                }
            }
            double area=(right-left)*(bottom-top);
            uint32_t pixel=0;
            for (int c=0; c<4; ++c) pixel|=(uint32_t)(sums[c]/area+0.5)<<(c*8);
            row[x]=pixel;
        }
    }
}
#endif
