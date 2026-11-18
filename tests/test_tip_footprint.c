#include <assert.h>
#include <math.h>
#include <stdio.h>
#include "quadro_brush_footprint.h"

int main(void) {
    assert(w_tip_circle_sample(0,0,4)==1);
    /* Compare the fast broad-tip path with independent area sampling,
       including fractional diagonal boundaries at several radii. */
    for (int radius=4; radius<=64; radius*=4) {
        for (int angle=0; angle<=8; ++angle) for (int edge=-4; edge<=4; ++edge) {
            float radians=angle*0.0981747704f;
            float dx=(radius+edge*0.1f)*cosf(radians);
            float dy=(radius+edge*0.1f)*sinf(radians);
            float reference=0;
            for (int y=0; y<64; ++y) for (int x=0; x<64; ++x) {
                float px=dx+(x+0.5f)/128-0.25f;
                float py=dy+(y+0.5f)/128-0.25f;
                if (px*px+py*py<=radius*radius) reference+=1.0f/4096;
            }
            assert(fabsf(w_tip_circle_sample(dx,dy,radius)-reference)<0.025f);
        }
    }
    puts("Broad-tip fast coverage agrees with independent area sampling");
}
