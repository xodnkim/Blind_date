/**
 * Blind Date - Main JavaScript (Supabase Version)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Blind Date initialized with Supabase.");
    
    const db = window.supabaseClient;
    if (!db) {
        console.warn("Supabase client not found. DB operations will fail, but hardcoded admin might work.");
    }

    // --- 에러 로그 기록 함수 ---
    const logError = async (message, userId = 'guest') => {
        if (!db) return;
        try {
            await db.from('error_logs').insert([{
                user_id: userId,
                page_url: window.location.href,
                error_message: message,
                browser_info: navigator.userAgent
            }]);
        } catch (e) {
            console.error("Critical: Failed to log error to DB", e);
        }
    };

    // --- Admin Credentials (Hardcoded for initial setup) ---
    const ADMIN_ID = "xodn9900";
    const ADMIN_PW = "dkvmflzk12!";

    // --- Login Handler ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idInput = document.getElementById('username').value;
            const pwInput = document.getElementById('password').value;
            
            // 1. Check Hardcoded Admin
            if (idInput === ADMIN_ID && pwInput === ADMIN_PW) {
                alert("관리자 계정으로 로그인합니다.");
                sessionStorage.setItem('currentUser', JSON.stringify({ id: ADMIN_ID, name: '관리자', role: 'admin' }));
                window.location.href = 'main.html'; 
                return;
            }

            // 2. Check Supabase DB
            if (!db) {
                alert('데이터베이스 연결이 설정되지 않았습니다.');
                return;
            }

            const { data: user, error } = await db
                .from('users')
                .select('*')
                .eq('id', idInput)
                .eq('password', pwInput)
                .single();

            if (error || !user) {
                alert('아이디 또는 비밀번호가 올바르지 않습니다.');
                return;
            }

            if (user.status === 'pending') {
                alert('아직 승인 대기 중입니다. 지인 확인 후 승인해 드릴게요!');
                return;
            }

            const rememberMe = document.getElementById('rememberMe')?.checked;
            alert(`${user.name}님, 환영합니다!`);
            
            const userData = JSON.stringify(user);
            if (rememberMe) {
                localStorage.setItem('currentUser', userData);
            } else {
                sessionStorage.setItem('currentUser', userData);
            }
            window.location.href = 'main.html';
        });
    }

    // --- Signup Handler ---
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('signupId').value;
            const password = document.getElementById('signupPassword').value;
            const name = document.getElementById('signupName').value;
            const phone = document.getElementById('signupPhone').value;
            const referrer = document.getElementById('signupReferrer').value;
            
            if (!db) {
                alert('데이터베이스 연결이 설정되지 않았습니다.');
                return;
            }

            // Check if ID already exists
            const { data: existingUsers } = await db.from('users').select('id').eq('id', id);
            if (existingUsers && existingUsers.length > 0) {
                alert('이미 존재하는 아이디입니다.');
                return;
            }

            // Insert new user
            const { error } = await db.from('users').insert([{
                id,
                password,
                name,
                phone,
                referrer,
                role: 'user',
                status: 'pending',
                created_at: new Date().toISOString()
            }]);

            if (error) {
                if (error.code === '23505') {
                    alert('이미 존재하는 아이디입니다.');
                } else {
                    alert('회원가입 처리 중 오류가 발생했습니다: ' + error.message);
                }
            } else {
                alert(`${name}님, 회원가입 요청이 전송되었습니다.\n지인 확인 후 승인해 드릴 예정입니다.`);
                window.location.href = 'index.html';
            }
        });
    }

    const getSessionUser = () => {
        return JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser'));
    };

    const logout = () => {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    };

    // --- Main Dashboard Logic ---
    const isMainPage = window.location.pathname.includes('main.html');
    
    if (isMainPage) {
        const sessionUser = getSessionUser();
        
        // 1. Session Protection
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        // 2. Update Welcome UI
        const welcomeNameEl = document.getElementById('welcomeName');
        if (welcomeNameEl) {
            // Include a crown icon if admin, otherwise just the name
            const icon = sessionUser.role === 'admin' ? '<i class="ph-fill ph-crown" style="color: #ffce00; margin-right: 4px;"></i>' : '';
            welcomeNameEl.innerHTML = icon + sessionUser.name + '님';
        }

        const adminMenuLink = document.getElementById('adminMenuLink');
        if (adminMenuLink && sessionUser.role === 'admin') {
            adminMenuLink.style.display = 'inline-block';
        }

        // 3. Logout Handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        // 4. Check Profile Status
        const checkProfileStatus = async () => {
            if (!db) return;
            const { data: profile } = await db.from('profiles').select('user_id').eq('user_id', sessionUser.id).single();
            
            const btnFindDate = document.getElementById('btnFindDate');

            if (profile) {
                // Enable Find Date button
                if (btnFindDate) {
                    btnFindDate.disabled = false;
                    btnFindDate.style.opacity = '1';
                    btnFindDate.style.cursor = 'pointer';
                }

                const title = document.getElementById('profileCardTitle');
                const desc = document.getElementById('profileCardDesc');
                const actionArea = document.getElementById('profileActionArea');
                
                if (title) title.innerText = '내 프로필 관리';
                if (desc) desc.innerText = '등록된 프로필을 확인하거나 수정할 수 있습니다.';

                // Update Main Dashboard Welcome Text
                const mainTitle = document.getElementById('mainTitle');
                const mainSubtitle = document.getElementById('mainSubtitle');
                if (mainTitle) mainTitle.innerText = '인연을 찾아보세요 ✨';
                if (mainSubtitle) mainSubtitle.innerText = '나와 잘 어울리는 새로운 인연을 탐색할 시간입니다.';
                if (actionArea) {
                    actionArea.innerHTML = `
                        <button class="btn-action secondary" onclick="window.location.href='profile_view.html'" style="flex: 1; padding: 12px; font-size: 0.95rem;">프로필 확인</button>
                        <button class="btn-action" onclick="window.location.href='profile.html'" style="flex: 1; padding: 12px; font-size: 0.95rem;">프로필 수정</button>
                    `;
                }
            } else {
                // Disable Find Date button
                if (btnFindDate) {
                    btnFindDate.disabled = true;
                    btnFindDate.style.opacity = '0.5';
                    btnFindDate.style.cursor = 'not-allowed';
                    btnFindDate.onclick = (e) => {
                        e.preventDefault();
                        alert('프로필을 먼저 등록해야 인연 찾기가 가능합니다.');
                        return false;
                    };
                }
            }
        };
        checkProfileStatus();

        // 5. Check for Notifications (New match requests received)
        const checkNotifications = async () => {
            if (!db || !sessionUser) return;
            
            // Get last viewed timestamp for notifications
            const lastViewed = localStorage.getItem(`lastViewedMatches_${sessionUser.id}`);
            
            // Check for any pending requests sent TO the user
            let query = db.from('matches')
                .select('created_at')
                .eq('to_user_id', sessionUser.id)
                .eq('status', 'pending');
            
            if (lastViewed) {
                query = query.gt('created_at', lastViewed);
            }
            
            const { data: received } = await query;
            
            if (received && received.length > 0) {
                const btnMatchStatus = document.getElementById('btnMatchStatus');
                if (btnMatchStatus) {
                    btnMatchStatus.classList.add('btn-highlight');
                    btnMatchStatus.innerHTML = '<i class="ph-fill ph-bell-ringing"></i> 신청 확인하기';
                }
            }
        };
        checkNotifications();
    }

    // --- Profile Form Handler ---
    const isProfilePage = window.location.pathname.includes('profile.html');
    if (isProfilePage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        const profileForm = document.getElementById('profileForm');
        
        // --- 이미지 미리보기 기능 ---
        const setupImagePreview = (inputId) => {
            const input = document.getElementById(inputId);
            if (!input) return;
            input.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const box = input.closest('.photo-box');
                        box.style.backgroundImage = `url(${e.target.result})`;
                        box.style.backgroundSize = 'cover';
                        box.style.backgroundPosition = 'center';
                        const label = box.querySelector('.photo-label');
                        if (label) label.style.display = 'none'; // 아이콘 및 텍스트 숨기기
                    }
                    reader.readAsDataURL(file);
                }
            });
        };
        setupImagePreview('photo1');
        setupImagePreview('photo2');
        setupImagePreview('photo3');

        // --- 기존 프로필 불러오기 (수정 모드) ---
        const loadExistingProfile = async () => {
            if (!db) return;
            const { data: profile } = await db.from('profiles').select('*').eq('user_id', sessionUser.id).single();
            if (profile) {
                // 텍스트/숫자/셀렉트/텍스트에리어 값 채우기
                const setVal = (id, val) => { if (document.getElementById(id) && val) document.getElementById(id).value = val; };
                setVal('profileName', profile.name);
                setVal('birthYear', profile.birth_year);
                setVal('bodyType', profile.body_type);
                setVal('location', profile.location);
                setVal('height', profile.height);
                setVal('job', profile.job);
                setVal('jobLocation', profile.job_location);
                setVal('mbti', profile.mbti);
                setVal('smoking', profile.smoking);
                setVal('drinking', profile.drinking);
                setVal('tattoo', profile.tattoo);
                setVal('religion', profile.religion);
                setVal('longDistance', profile.long_distance);
                setVal('hobbies', profile.hobbies);
                setVal('introMessage', profile.intro_message);
                setVal('idealType', profile.ideal_type);

                // 라디오 버튼 (성별) 채우기
                if (profile.gender) {
                    const radio = document.querySelector(`input[name="gender"][value="${profile.gender}"]`);
                    if (radio) radio.checked = true;
                }

                // 사진 채우기
                const setPhoto = (inputId, url) => {
                    if (url) {
                        const box = document.getElementById(inputId).closest('.photo-box');
                        box.style.backgroundImage = `url(${url})`;
                        box.style.backgroundSize = 'cover';
                        box.style.backgroundPosition = 'center';
                        const label = box.querySelector('.photo-label');
                        if (label) label.style.display = 'none';
                        // 이미 사진이 있으므로 required 해제 (새로 안 올려도 됨)
                        document.getElementById(inputId).removeAttribute('required');
                    }
                };
                setPhoto('photo1', profile.photo1);
                setPhoto('photo2', profile.photo2);
                setPhoto('photo3', profile.photo3);
            }
        };
        loadExistingProfile();

        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const profileData = {
                    user_id: sessionUser.id,
                    name: document.getElementById('profileName').value,
                    gender: document.querySelector('input[name="gender"]:checked')?.value || '',
                    birth_year: document.getElementById('birthYear').value,
                    body_type: document.getElementById('bodyType').value,
                    location: document.getElementById('location').value,
                    height: document.getElementById('height').value,
                    job: document.getElementById('job').value,
                    job_location: document.getElementById('jobLocation').value,
                    mbti: document.getElementById('mbti').value,
                    smoking: document.getElementById('smoking').value,
                    drinking: document.getElementById('drinking').value,
                    tattoo: document.getElementById('tattoo').value,
                    religion: document.getElementById('religion').value,
                    long_distance: document.getElementById('longDistance').value,
                    hobbies: document.getElementById('hobbies').value,
                    intro_message: document.getElementById('introMessage').value,
                    ideal_type: document.getElementById('idealType').value,
                    updated_at: new Date().toISOString()
                };

                if (!db) {
                    alert('데이터베이스 연결이 설정되지 않았습니다.');
                    return;
                }

                // --- UI 비활성화 및 로딩 표시 ---
                const submitBtn = profileForm.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerText;
                submitBtn.innerText = '사진 업로드 및 저장 중...';
                submitBtn.disabled = true;

                // --- 파일 업로드 함수 ---
                const uploadPhoto = async (fileInputId) => {
                    const fileInput = document.getElementById(fileInputId);
                    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;
                    
                    const file = fileInput.files[0];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${sessionUser.id}_${fileInputId}_${Date.now()}.${fileExt}`;
                    const filePath = `${sessionUser.id}/${fileName}`;
                    
                    const { error: uploadError } = await db.storage.from('profile_photos').upload(filePath, file);
                    if (uploadError) {
                        const errMsg = `사진 업로드 실패 (${fileInputId}): ${uploadError.message}`;
                        alert(errMsg + '\n\n* Storage 권한 문제일 가능성이 높습니다.');
                        logError(errMsg, sessionUser.id);
                        return null; 
                    }
                    
                    const { data } = db.storage.from('profile_photos').getPublicUrl(filePath);
                    return data.publicUrl;
                };

                // 순차적으로 업로드 진행
                try {
                    const url1 = await uploadPhoto('photo1');
                    const url2 = await uploadPhoto('photo2');
                    const url3 = await uploadPhoto('photo3');

                    if (url1) profileData.photo1 = url1;
                    if (url2) profileData.photo2 = url2;
                    if (url3) profileData.photo3 = url3;

                    const { error } = await db.from('profiles').upsert(profileData);

                    if (error) {
                        const errMsg = `프로필 저장 실패: ${error.message}`;
                        alert(errMsg + '\n\n* DB 컬럼이 부족하거나 설정 문제일 수 있습니다.');
                        logError(errMsg, sessionUser.id);
                    } else {
                        alert('프로필과 사진이 성공적으로 저장되었습니다!');
                        window.location.href = 'main.html';
                    }
                } catch (e) {
                    alert('처리 중 오류가 발생했습니다: ' + e.message);
                } finally {
                    submitBtn.innerText = originalBtnText;
                    submitBtn.disabled = false;
                }
            });
        }
    }

    // --- Admin Dashboard Logic ---
    const isAdminPage = window.location.pathname.includes('admin.html');
    if (isAdminPage) {
        const sessionUser = getSessionUser();
        if (!sessionUser || sessionUser.role !== 'admin') {
            alert('관리자 권한이 없습니다.');
            window.location.href = 'index.html';
            return;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        const loadPendingUsers = async () => {
            const listBody = document.getElementById('adminUserList');
            if (!listBody || !db) return;

            const { data: users, error } = await db.from('users').select('*').order('created_at', { ascending: false });
            
            if (error) {
                listBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--primary);">오류 발생: ${error.message}</td></tr>`;
                return;
            }

            if (!users || users.length === 0) {
                listBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">가입 대기 중인 회원이 없습니다.</td></tr>`;
                return;
            }

            listBody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.id}</td>
                    <td>${u.name}</td>
                    <td>${u.phone || '-'}</td>
                    <td>${u.referrer || '-'}</td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${u.status === 'pending' 
                                ? `<button class="btn-small" onclick="approveUser('${u.id}')">승인하기</button>` 
                                : `<span class="badge approved" style="margin-right: 0;">승인완료</span>`
                            }
                            ${u.id !== ADMIN_ID ? `<button class="btn-small" style="background: rgba(255, 77, 109, 0.1); color: #ff4d6d; border: 1px solid rgba(255, 77, 109, 0.3);" onclick="deleteUser('${u.id}')"><i class="ph ph-user-minus"></i> 탈퇴</button>` : ''}
                        </div>
                    </td>
                </tr>
            `).join('');
        };

        window.approveUser = async (userId) => {
            if (!confirm(`${userId} 님의 가입을 승인하시겠습니까?`)) return;
            
            const { error } = await db.from('users').update({ status: 'approved' }).eq('id', userId);
            
            if (error) {
                alert('승인 처리 중 오류 발생: ' + error.message);
            } else {
                alert('승인되었습니다.');
                loadPendingUsers();
            }
        };

        window.deleteUser = async (userId) => {
            if (!confirm(`정말 ${userId} 회원을 탈퇴 처리하시겠습니까?\n해당 회원의 프로필 및 모든 매칭 데이터가 영구적으로 삭제됩니다.`)) return;
            
            if (!db) return;

            try {
                // 1. 매칭 데이터 삭제 (보낸 것, 받은 것 모두)
                await db.from('matches').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
                
                // 2. 프로필 데이터 삭제
                await db.from('profiles').delete().eq('user_id', userId);
                
                // 3. 사용자 계정 삭제
                const { error } = await db.from('users').delete().eq('id', userId);
                
                if (error) throw error;
                
                alert(`${userId} 회원이 성공적으로 탈퇴 처리되었습니다.`);
                loadPendingUsers();
            } catch (err) {
                alert('탈퇴 처리 중 오류 발생: ' + err.message);
                console.error(err);
            }
        };

        loadPendingUsers();
    }

    // --- Profile View Logic ---
    const isProfileViewPage = window.location.pathname.includes('profile_view.html');
    if (isProfileViewPage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        const loadProfileView = async () => {
            if (!db) return;
            
            const urlParams = new URLSearchParams(window.location.search);
            const targetUserId = urlParams.get('id') || sessionUser.id;
            const isSelf = targetUserId === sessionUser.id;

            // 1. Fetch Profile Data
            const { data: profile, error } = await db.from('profiles').select('*').eq('user_id', targetUserId).single();
            
            document.getElementById('loadingMsg').style.display = 'none';

            if (error || !profile) {
                alert('프로필을 찾을 수 없습니다.');
                window.location.href = 'main.html';
                return;
            }

            // 2. Fetch Match Status (if not self)
            let isMatched = false;
            let myRequestStatus = null; // 'pending' or 'rejected' or null
            let mutual = null;

            if (!isSelf) {
                // Check if I liked them
                const { data: myReq } = await db.from('matches').select('status').eq('from_user_id', sessionUser.id).eq('to_user_id', targetUserId).maybeSingle();
                myRequestStatus = myReq?.status;

                // Check if we are mutually matched
                const { data: mutualData } = await db.from('matches').select('status').eq('from_user_id', targetUserId).eq('to_user_id', sessionUser.id).maybeSingle();
                mutual = mutualData;
                
                if (myRequestStatus === 'pending' && mutual && mutual.status === 'pending') {
                    isMatched = true;
                }
            }

            document.getElementById('profileViewCard').style.display = 'block';

            // 3. Photo Slider Logic
            const photos = [profile.photo1, profile.photo2, profile.photo3].filter(p => p);
            window.profilePhotos = photos;
            window.currentPhotoIndex = 0;

            const updatePhotoView = () => {
                if (photos.length === 0) {
                    document.getElementById('vPhoto').style.display = 'none';
                    document.querySelector('.view-photos').style.display = 'flex';
                    document.querySelector('.view-photos').style.alignItems = 'center';
                    document.querySelector('.view-photos').style.justifyContent = 'center';
                    document.querySelector('.view-photos').innerHTML = '<span style="color: #666;">등록된 사진이 없습니다.</span>';
                    return;
                }

                const img = document.getElementById('vPhoto');
                img.src = photos[window.currentPhotoIndex];
                img.style.display = 'block';

                // Blur logic: If not self and not matched, blur the photo
                if (!isSelf && !isMatched) {
                    img.classList.add('blurred');
                } else {
                    img.classList.remove('blurred');
                }

                // Update Indicators
                const indicators = document.getElementById('photoIndicators');
                if (indicators) {
                    if (photos.length > 1) {
                        indicators.innerHTML = photos.map((_, idx) => 
                            `<div class="photo-bar ${idx === window.currentPhotoIndex ? 'active' : ''}"></div>`
                        ).join('');
                    } else {
                        indicators.innerHTML = '';
                    }
                }
            };

            window.prevPhoto = () => {
                if (!window.profilePhotos || window.profilePhotos.length <= 1) return;
                window.currentPhotoIndex = (window.currentPhotoIndex > 0) ? window.currentPhotoIndex - 1 : window.profilePhotos.length - 1;
                updatePhotoView();
            };

            window.nextPhoto = () => {
                if (!window.profilePhotos || window.profilePhotos.length <= 1) return;
                window.currentPhotoIndex = (window.currentPhotoIndex < window.profilePhotos.length - 1) ? window.currentPhotoIndex + 1 : 0;
                updatePhotoView();
            };

            updatePhotoView();

            // 4. Fill Information
            const genderSymbol = profile.gender === '여성' ? 
                '<span style="color: #ff4d6d; font-size: 0.85em; margin-left: 4px; font-weight: bold;">♀</span>' : 
                '<span style="color: #4361ee; font-size: 0.85em; margin-left: 4px; font-weight: bold;">♂</span>';
            document.getElementById('vName').innerHTML = profile.name + genderSymbol;
            document.getElementById('vAge').innerText = profile.birth_year + '년생';
            document.getElementById('vLocation').innerText = profile.location;
            document.getElementById('vHeight').innerText = profile.height + 'cm';
            document.getElementById('vBodyTypeTop').innerText = profile.body_type || '보통';
            
            document.getElementById('vJob').innerText = profile.job + (profile.job_location ? ` (${profile.job_location})` : '');
            document.getElementById('vMbti').innerText = profile.mbti;
            document.getElementById('vSmoking').innerText = profile.smoking;
            document.getElementById('vDrinking').innerText = profile.drinking;
            document.getElementById('vTattoo').innerText = profile.tattoo;
            document.getElementById('vReligion').innerText = profile.religion;
            document.getElementById('vLongDistance').innerText = profile.long_distance || '장거리 무관';
            
            document.getElementById('vIntro').innerText = profile.intro_message;
            document.getElementById('vIdeal').innerText = profile.ideal_type;

            const hobbiesArea = document.getElementById('vHobbiesArea');
            if (profile.hobbies) {
                const hobbiesList = profile.hobbies.split(/[\s,]+/).filter(h => h.trim() !== '');
                hobbiesArea.innerHTML = hobbiesList.map(h => `<div class="view-tag">#${h.replace(/^#/, '')}</div>`).join('');
            }

            // 5. Match Action Logic
            const actionArea = document.getElementById('matchActionArea');
            const selfMsg = document.getElementById('selfProfileMsg');

            if (isSelf) {
                selfMsg.style.display = 'block';
            } else {
                actionArea.style.display = 'block';
                
                const successMsg = document.getElementById('matchSuccessMsg');
                const matchButtons = document.getElementById('matchButtons');
                const btnRequest = document.getElementById('btnRequestMatch');
                const btnReject = document.getElementById('btnReject');

                // Check if they sent a request to me
                const { data: incomingReq } = await db.from('matches')
                    .select('id')
                    .eq('from_user_id', targetUserId)
                    .eq('to_user_id', sessionUser.id)
                    .eq('status', 'pending')
                    .maybeSingle();

                if (isMatched) {
                    // Reveal Phone Number
                    const { data: targetUser } = await db.from('users').select('phone').eq('id', targetUserId).single();
                    document.getElementById('vPhone').innerText = targetUser?.phone || '공개 불가';
                    successMsg.style.display = 'block';
                    matchButtons.style.display = 'none';
                } else if (mutual && mutual.status === 'rejected') {
                    // They rejected me
                    btnRequest.innerText = '거절 당함';
                    btnRequest.disabled = true;
                    btnRequest.style.opacity = '0.5';
                    btnRequest.style.cursor = 'not-allowed';
                    btnReject.style.display = 'none';
                    btnRequest.classList.remove('btn-highlight');
                } else if (myRequestStatus === 'pending') {
                    btnRequest.innerText = '매칭 신청 완료';
                    btnRequest.disabled = true;
                    btnRequest.style.opacity = '0.7';
                    btnReject.style.display = 'none';
                } else if (myRequestStatus === 'rejected') {
                    // I rejected them
                    btnRequest.innerText = '다시 매칭하기';
                    btnRequest.disabled = false;
                    btnRequest.style.opacity = '1';
                    btnRequest.style.cursor = 'pointer';
                    btnReject.style.display = 'none';
                    btnRequest.classList.remove('btn-highlight');
                } else if (incomingReq) {
                    // Received a request but haven't responded
                    btnRequest.innerText = '매칭 수락하기';
                    btnRequest.classList.add('btn-highlight');
                    btnReject.innerText = '거절하기';
                    btnReject.style.display = 'block';
                }

                const showMatchSuccess = () => {
                    const overlay = document.createElement('div');
                    overlay.className = 'match-overlay';
                    overlay.innerHTML = `
                        <div class="match-heart"><i class="ph-fill ph-heart"></i></div>
                        <div class="match-text">매칭이 성사되었습니다!</div>
                        <p style="color: white; margin-top: 20px; font-size: 1.1rem;">상대방의 연락처를 확인해보세요.</p>
                        <button class="btn-action" style="width: auto; padding: 12px 40px; margin-top: 30px;" onclick="window.location.reload()">확인</button>
                    `;
                    document.body.appendChild(overlay);
                };

                // Event Listeners
                btnRequest.onclick = async () => {
                    console.log('Button Clicked. Status:', myRequestStatus);
                    if (myRequestStatus === 'pending') return;
                    if (mutual && mutual.status === 'rejected') {
                        alert('상대방이 거절한 상태라 신청할 수 없습니다.');
                        return;
                    }
                    
                    if (myRequestStatus === 'rejected') {
                        if (!confirm('정말 다시 매칭 신청을 보내시겠습니까?')) return;
                        const { error } = await db.from('matches')
                            .update({ status: 'pending' })
                            .eq('from_user_id', sessionUser.id)
                            .eq('to_user_id', targetUserId);
                            
                        if (error) {
                            alert('신청 중 오류 발생: ' + error.message);
                            return;
                        }
                    } else {
                        // New request or accepting incoming
                        const { error } = await db.from('matches').upsert([{ 
                            from_user_id: sessionUser.id, 
                            to_user_id: targetUserId, 
                            status: 'pending' 
                        }]);
                        
                        if (error) {
                            alert('신청 중 오류 발생: ' + error.message);
                            return;
                        }
                    }
                    
                    // Check if it's now a match
                    const { data: latestMutual } = await db.from('matches')
                        .select('status')
                        .eq('from_user_id', targetUserId)
                        .eq('to_user_id', sessionUser.id)
                        .maybeSingle();
                    
                    if (latestMutual && latestMutual.status === 'pending') {
                        showMatchSuccess();
                    } else {
                        const msg = myRequestStatus === 'rejected' ? '매칭 신청을 다시 보냈습니다!' : '매칭 신청을 보냈습니다!';
                        alert(msg);
                        window.location.reload();
                    }
                };

                btnReject.onclick = async () => {
                    if (!confirm('정말 거절하시겠습니까? 다시는 볼 수 없게 됩니다.')) return;
                    
                    // 1. Insert/Update my rejection
                    const { error: rejectError } = await db.from('matches').upsert([{ 
                        from_user_id: sessionUser.id, 
                        to_user_id: targetUserId, 
                        status: 'rejected' 
                    }]);
                    
                    // 2. Also update their request to me to 'rejected' so it's not 'pending' anymore
                    // This prevents automatic matching if I later choose to 'Rematch'
                    await db.from('matches')
                        .update({ status: 'rejected' })
                        .eq('from_user_id', targetUserId)
                        .eq('to_user_id', sessionUser.id)
                        .eq('status', 'pending');

                    if (rejectError) alert('처리 중 오류 발생: ' + rejectError.message);
                    else {
                        alert('거절되었습니다.');
                        window.location.href = 'find_date.html';
                    }
                };
            }
        };

        loadProfileView();
    }

    // --- Find Date Page Logic ---
    const isFindDatePage = window.location.pathname.includes('find_date.html');
    if (isFindDatePage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            window.location.href = 'index.html';
            return;
        }

        const loadMembers = async () => {
            if (!db) return;
            
            // 1. Get current user's profile to know their gender
            const { data: myProfile } = await db.from('profiles').select('gender').eq('user_id', sessionUser.id).single();
            const targetGender = myProfile?.gender === '남성' ? '여성' : (myProfile?.gender === '여성' ? '남성' : null);

            // 2. Get IDs I've already interacted with (Requested or Rejected)
            const { data: myMatches } = await db.from('matches').select('to_user_id').eq('from_user_id', sessionUser.id);
            const excludedIds = myMatches?.map(m => m.to_user_id) || [];
            excludedIds.push(sessionUser.id); // Also exclude myself

            // 3. Fetch all profiles
            let query = db.from('profiles').select('*');
            
            // 4. Filter by gender if possible
            if (targetGender) {
                query = query.eq('gender', targetGender);
            }

            const { data: members, error } = await query;
            
            document.getElementById('loadingArea').style.display = 'none';

            if (error || !members || members.length === 0) {
                document.getElementById('noMembersMsg').style.display = 'block';
                return;
            }

            // 5. Client-side filter for excluded IDs
            const filteredMembers = members.filter(m => !excludedIds.includes(m.user_id));

            if (filteredMembers.length === 0) {
                document.getElementById('noMembersMsg').style.display = 'block';
                return;
            }

            const grid = document.getElementById('membersGrid');
            grid.innerHTML = filteredMembers.map(m => `
                <div class="member-card" onclick="window.location.href='profile_view.html?id=${m.user_id}'">
                    <div class="member-photo-blur"></div>
                    <div class="member-info">
                        <div class="member-name-age">${m.name} <span style="font-weight: 400; color: #888;">· ${m.birth_year}년생</span></div>
                        <div style="color: var(--text-muted); font-size: 0.9rem;">${m.location} · ${m.height}cm</div>
                        <div class="member-tags">
                            <span class="member-tag">${m.job}</span>
                            <span class="member-tag">${m.mbti}</span>
                            <span class="member-tag">${m.body_type}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        };

        loadMembers();
    }

    // --- Match Status Page Logic ---
    const isMatchStatusPage = window.location.pathname.includes('match_status.html');
    if (isMatchStatusPage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            window.location.href = 'index.html';
            return;
        }

        const loadMatchStatus = async () => {
            if (!db || !sessionUser) return;

            // Save view timestamp to clear notifications
            localStorage.setItem(`lastViewedMatches_${sessionUser.id}`, new Date().toISOString());

            // 1. Fetch Sent Requests
            const { data: sent } = await db.from('matches').select('to_user_id, status').eq('from_user_id', sessionUser.id);
            
            // 2. Fetch Received Requests
            const { data: received } = await db.from('matches').select('from_user_id, status').eq('to_user_id', sessionUser.id);

            // 3. Profiles for all these IDs
            const allIds = [...new Set([...(sent?.map(s => s.to_user_id) || []), ...(received?.map(r => r.from_user_id) || [])])];
            const { data: profiles } = await db.from('profiles').select('user_id, name, birth_year, location').in('user_id', allIds);
            const profileMap = Object.fromEntries(profiles?.map(p => [p.user_id, p]) || []);

            document.getElementById('loadingArea').style.display = 'none';
            document.getElementById('statusContent').style.display = 'block';

            // Filter logic
            const matchedList = document.getElementById('matchedList');
            const receivedList = document.getElementById('receivedList');
            const sentList = document.getElementById('sentList');

            const matchedIds = [];
            const receivedItems = [];
            const sentItems = [];

            // Identify Mutual Matches
            sent?.forEach(s => {
                const isMutual = received?.some(r => r.from_user_id === s.to_user_id && r.status === 'pending') && s.status === 'pending';
                const isRejectedByThem = received?.some(r => r.from_user_id === s.to_user_id && r.status === 'rejected');

                if (isMutual) {
                    matchedIds.push(s.to_user_id);
                } else if (s.status === 'pending') {
                    if (isRejectedByThem) {
                        s.wasRejected = true;
                    }
                    sentItems.push(s);
                }
            });

            received?.forEach(r => {
                if (!matchedIds.includes(r.from_user_id) && r.status === 'pending') {
                    // Check if I rejected this person
                    const myResponse = sent?.find(s => s.to_user_id === r.from_user_id);
                    r.myResponseStatus = myResponse?.status;
                    receivedItems.push(r);
                }
            });

            // Render
            const renderItem = (userId, badgeText, badgeClass = '', isMatched = false, showDelete = false) => {
                const p = profileMap[userId];
                if (!p) return '';

                let finalBadgeText = badgeText;
                let finalBadgeClass = badgeClass;

                // If this is in received list and I rejected it
                const rReq = receivedItems.find(item => item.from_user_id === userId);
                if (rReq && rReq.myResponseStatus === 'rejected') {
                    finalBadgeText = '거절함';
                    finalBadgeClass = '';
                }

                // If this is in sent list and they rejected it
                const sReq = sentItems.find(item => item.to_user_id === userId);
                if (sReq && sReq.wasRejected) {
                    finalBadgeText = '거절됨';
                    finalBadgeClass = '';
                }

                return `
                    <div class="match-item ${isMatched ? 'success' : ''}" onclick="window.location.href='profile_view.html?id=${userId}'">
                        <div class="user-info">
                            <div class="user-avatar-small"><i class="ph-fill ph-user"></i></div>
                            <div class="user-details">
                                <h4>${p.name}</h4>
                                <p>${p.birth_year}년생 · ${p.location}</p>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="match-status-badge ${finalBadgeClass}">${finalBadgeText}</span>
                            ${showDelete ? `<button class="btn-icon" style="font-size: 1.2rem; color: #666; padding: 5px;" onclick="event.stopPropagation(); deleteMatch('${userId}')" title="삭제"><i class="ph ph-trash"></i></button>` : ''}
                        </div>
                    </div>
                `;
            };

            matchedList.innerHTML = matchedIds.length > 0 ? matchedIds.map(id => renderItem(id, '매칭 성공', 'badge-success', true)).join('') : '<p style="font-size:0.9rem; color:#666; padding:10px;">아직 매칭된 인연이 없습니다.</p>';
            receivedList.innerHTML = receivedItems.length > 0 ? receivedItems.map(r => renderItem(r.from_user_id, '확인하기', 'badge-pending', false, true)).join('') : '<p style="font-size:0.9rem; color:#666; padding:10px;">나를 선택한 분이 아직 없습니다.</p>';
            sentList.innerHTML = sentItems.length > 0 ? sentItems.map(s => renderItem(s.to_user_id, '대기 중')).join('') : '<p style="font-size:0.9rem; color:#666; padding:10px;">보낸 신청이 없습니다.</p>';
        };

        window.deleteMatch = async (targetUserId) => {
            if (!confirm('이 신청 내역을 목록에서 삭제하시겠습니까?')) return;
            if (!db || !sessionUser) return;

            // Delete their request to me
            const { error } = await db.from('matches')
                .delete()
                .eq('from_user_id', targetUserId)
                .eq('to_user_id', sessionUser.id);

            if (error) alert('삭제 중 오류 발생: ' + error.message);
            else {
                alert('삭제되었습니다.');
                loadMatchStatus();
            }
        };

        loadMatchStatus();
    }

});
