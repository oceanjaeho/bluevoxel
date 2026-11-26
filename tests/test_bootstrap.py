import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")

from clam_inspect.bootstrap import gap_to_nearest, segment_on_mat


def mat_image():
    img = np.zeros((600, 800, 3), np.uint8)
    img[:] = (140, 150, 20)  # BGR 청록 매트
    # 바지락 3개 (위 2, 아래 1) + 첫 개체에 붙은 가는 물 반사 줄기
    cv2.ellipse(img, (200, 150), (80, 55), 10, 0, 360, (150, 160, 170), -1)
    cv2.line(img, (275, 150), (360, 140), (235, 240, 240), 6)
    cv2.ellipse(img, (550, 160), (70, 50), -15, 0, 360, (60, 70, 80), -1)
    cv2.ellipse(img, (380, 430), (90, 60), 0, 0, 360, (110, 140, 170), -1)
    cv2.circle(img, (700, 500), 4, (240, 240, 240), -1)  # 작은 물방울: 무시돼야 함
    return img


def test_segment_counts_orders_and_strips_glare_tail():
    insts = segment_on_mat(mat_image())
    assert [i.idx for i in insts] == [1, 2, 3]
    first = insts[0]
    assert first.box[0] < 140 and first.box[2] < 300  # 반사 줄기(x≈360까지) 제거
    assert insts[1].box[0] > 450  # 같은 줄 오른쪽이 2번
    assert insts[2].box[1] > 350  # 아랫줄이 3번
    assert all(not i.touches_border for i in insts)
    assert all(g > 50 for g in gap_to_nearest(insts).values())
