#include <assert.h>
#include <stdio.h>
#include "quadro_viewport_filter.h"

int main(void) {
    uint32_t source[64], target[6];
    /* A one-pixel line must survive at every phase of a 4x reduction. */
    for (int phase=0; phase<4; ++phase) {
        for (int y=0; y<8; ++y) for (int x=0; x<8; ++x)
            source[y*8+x]=x==phase ? 0xff000000 : 0xffffffff;
        w_viewport_reduce(source,8,8,target,2,2,8,0,0,1,1);
        assert(target[0]==0xffbfbfbf && target[2]==0xffbfbfbf);
        assert(target[1]==0xffffffff && target[3]==0xffffffff);
    }
    for (int i=0; i<25; ++i) source[i]=(i%5)==4 ? 0xff000000 : 0xffffffff;
    w_viewport_reduce(source,5,5,target,2,2,8,0,0,1,1);
    assert(target[0]==0xffffffff && target[1]==0xff999999);
    source[0]=0xff0000ff; source[1]=0;
    w_viewport_reduce(source,2,1,target,1,1,4,0,0,0,0);
    assert(target[0]==0x80000080); /* Premultiplied red; no color fringe. */
    for (int i=0; i<64; ++i) source[i]=0xff112233;
    for (int i=0; i<6; ++i) target[i]=0x12345678;
    w_viewport_reduce(source,8,8,target,2,2,12,1,1,1,1);
    for (int i=0; i<6; ++i) assert(target[i]==(i==4 ? 0xff112233 : 0x12345678));
    puts("Viewport area reduction: thin lines, odd edges, alpha, dirty region and padded stride OK");
}
