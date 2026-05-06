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

            alert(`${user.name}님, 환영합니다!`);
            sessionStorage.setItem('currentUser', JSON.stringify(user));
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
            const { data: existing } = await db.from('users').select('id').eq('id', id).single();
            if (existing) {
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
                alert('회원가입 처리 중 오류가 발생했습니다: ' + error.message);
            } else {
                alert(`${name}님, 회원가입 요청이 전송되었습니다.\n지인 확인 후 승인해 드릴 예정입니다.`);
                window.location.href = 'index.html';
            }
        });
    }

    // --- Main Dashboard Logic ---
    const isMainPage = window.location.pathname.includes('main.html');
    
    if (isMainPage) {
        const sessionUser = JSON.parse(sessionStorage.getItem('currentUser'));
        
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
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            });
        }

        // 4. Check Profile Status
        const checkProfileStatus = async () => {
            if (!db) return;
            const { data: profile } = await db.from('profiles').select('user_id').eq('user_id', sessionUser.id).single();
            
            if (profile) {
                const title = document.getElementById('profileCardTitle');
                const desc = document.getElementById('profileCardDesc');
                const actionArea = document.getElementById('profileActionArea');
                
                if (title) title.innerText = '내 프로필 관리';
                if (desc) desc.innerText = '등록된 프로필을 확인하거나 수정할 수 있습니다.';
                if (actionArea) {
                    actionArea.innerHTML = `
                        <button class="btn-action secondary" onclick="window.location.href='profile_view.html'" style="flex: 1; padding: 12px; font-size: 0.95rem;">프로필 확인</button>
                        <button class="btn-action" onclick="window.location.href='profile.html'" style="flex: 1; padding: 12px; font-size: 0.95rem;">프로필 수정</button>
                    `;
                }
            }
        };
        checkProfileStatus();
    }

    // --- Profile Form Handler ---
    const isProfilePage = window.location.pathname.includes('profile.html');
    if (isProfilePage) {
        const sessionUser = JSON.parse(sessionStorage.getItem('currentUser'));
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
        const sessionUser = JSON.parse(sessionStorage.getItem('currentUser'));
        if (!sessionUser || sessionUser.role !== 'admin') {
            alert('관리자 권한이 없습니다.');
            window.location.href = 'index.html';
            return;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            });
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
                        ${u.status === 'pending' 
                            ? `<button class="btn-small" onclick="approveUser('${u.id}')">승인하기</button>` 
                            : `<span class="badge approved">승인완료</span>`
                        }
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

        loadPendingUsers();
    }

    // --- Profile View Logic ---
    const isProfileViewPage = window.location.pathname.includes('profile_view.html');
    if (isProfileViewPage) {
        const sessionUser = JSON.parse(sessionStorage.getItem('currentUser'));
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        const loadProfileView = async () => {
            if (!db) return;
            const { data: profile, error } = await db.from('profiles').select('*').eq('user_id', sessionUser.id).single();
            
            document.getElementById('loadingMsg').style.display = 'none';

            if (error || !profile) {
                alert('등록된 프로필을 찾을 수 없습니다.');
                window.location.href = 'main.html';
                return;
            }

            document.getElementById('profileViewCard').style.display = 'block';

            // --- Photo Slider Logic ---
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

                // Update Image
                document.getElementById('vPhoto').src = photos[window.currentPhotoIndex];
                document.getElementById('vPhoto').style.display = 'block';

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
                if (window.currentPhotoIndex > 0) {
                    window.currentPhotoIndex--;
                    updatePhotoView();
                } else {
                    // Loop to end
                    window.currentPhotoIndex = window.profilePhotos.length - 1;
                    updatePhotoView();
                }
            };

            window.nextPhoto = () => {
                if (!window.profilePhotos || window.profilePhotos.length <= 1) return;
                if (window.currentPhotoIndex < window.profilePhotos.length - 1) {
                    window.currentPhotoIndex++;
                    updatePhotoView();
                } else {
                    // Loop to start
                    window.currentPhotoIndex = 0;
                    updatePhotoView();
                }
            };

            // Initial load
            updatePhotoView();
            // --- End Photo Slider Logic ---
            
            document.getElementById('vName').innerText = profile.name + (profile.gender === '여성' ? ' 🙎‍♀️' : ' 🙎‍♂️');
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

            // Hobbies as tags
            const hobbiesArea = document.getElementById('vHobbiesArea');
            if (profile.hobbies) {
                // Split by comma or space, remove empty strings
                const hobbiesList = profile.hobbies.split(/[\s,]+/).filter(h => h.trim() !== '');
                hobbiesArea.innerHTML = hobbiesList.map(h => {
                    const cleanH = h.replace(/^#/, ''); // Remove existing # if user typed it
                    return `<div class="view-tag">#${cleanH}</div>`;
                }).join('');
            }
        };

        loadProfileView();
    }

});
