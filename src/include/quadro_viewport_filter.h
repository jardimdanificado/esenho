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
        /* Divisor zoom is the hot path while painting. A 2x2 box is by far the
         * most common reduction, and its four per-channel integer divisions
         * dominated the loop. Unroll it and keep the same rounded result. */
        if (nx==2 && ny==2) {
            for (int y=y0; y<=y1; ++y) {
                uint32_t *row=(uint32_t*)((uint8_t*)dst+(size_t)y*stride);
                const uint32_t *s0=src+(size_t)(y*2)*sw+x0*2;
                const uint32_t *s1=s0+sw;
                for (int x=x0; x<=x1; ++x) {
                    uint32_t p00=s0[0], p01=s0[1], p10=s1[0], p11=s1[1];
                    uint32_t red=(p00&255)+(p01&255)+(p10&255)+(p11&255);
                    uint32_t green=((p00>>8)&255)+((p01>>8)&255)+((p10>>8)&255)+((p11>>8)&255);
                    uint32_t blue=((p00>>16)&255)+((p01>>16)&255)+((p10>>16)&255)+((p11>>16)&255);
                    uint32_t alpha=(p00>>24)+(p01>>24)+(p10>>24)+(p11>>24);
                    row[x]=((red+2)>>2)|(((green+2)>>2)<<8)|(((blue+2)>>2)<<16)|(((alpha+2)>>2)<<24);
                    s0+=2; s1+=2;
                }
            }
            return;
        }
        int power_of_two=(count&(count-1))==0;
        int shift=power_of_two ? __builtin_ctzll(count) : 0;
        uint64_t reciprocal=power_of_two ? 0 : ((1ULL<<32)+count-1)/count;
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
                uint32_t r,g,b,a;
                if (power_of_two) {
                    uint32_t half=(uint32_t)(count/2);
                    r=(uint32_t)(red+half)>>shift;
                    g=(uint32_t)(green+half)>>shift;
                    b=(uint32_t)(blue+half)>>shift;
                    a=(uint32_t)(alpha+half)>>shift;
                } else {
                    uint64_t half=count/2;
                    r=(uint32_t)(((red+half)*reciprocal)>>32);
                    g=(uint32_t)(((green+half)*reciprocal)>>32);
                    b=(uint32_t)(((blue+half)*reciprocal)>>32);
                    a=(uint32_t)(((alpha+half)*reciprocal)>>32);
                    if (red+half >= (uint64_t)(r+1)*count) r++;
                    if (green+half >= (uint64_t)(g+1)*count) g++;
                    if (blue+half >= (uint64_t)(b+1)*count) b++;
                    if (alpha+half >= (uint64_t)(a+1)*count) a++;
                }
                row[x]=r|(g<<8)|(b<<16)|(a<<24);
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
